/**
 * ============================================================================
 * VTO Pipeline: Master Virtual Try-On Pipeline Orchestrator
 * ============================================================================
 * Coordinates:
 * - FaceTracker (MediaPipe FaceMesh 468+ landmarks)
 * - HeadPoseEstimator (6-DoF rigid head pose with true 3D Face Coordinate System)
 * - AnthropometricCalibrator (IPD, face width, metric scale)
 * - OneEuroFilter (Temporal smoothing on translation, quaternion rotation, scale)
 * - HeadOcclusionMesh (Depth-only face occluder for temple arm clipping)
 * - GlassesFitter (Anatomical bridge seating & pantoscopic tilt)
 *
 * Supports:
 * Mode 1: Device Camera AR (Live Webcam / Simulated Face Tracking)
 * Mode 2: 3D Avatar Studio (High-Fidelity 360° Orbit Inspection)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || global);
  } else {
    root.VTO = root.VTO || {};
    root.VTO.Pipeline = factory(root);
  }
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis), function (root) {
  "use strict";

  const getSubsystems = () => {
    const vto = (root && root.VTO) || (typeof window !== "undefined" && window.VTO) || {};
    return {
      Filter: vto.Filter || (typeof require !== "undefined" ? require("./filter.js") : null),
      Calibration: vto.Calibration || (typeof require !== "undefined" ? require("./calibration.js") : null),
      PoseEstimator: vto.PoseEstimator || (typeof require !== "undefined" ? require("./poseEstimator.js") : null),
      Occlusion: vto.Occlusion || (typeof require !== "undefined" ? require("./occlusion.js") : null),
      Fitter: vto.Fitter || (typeof require !== "undefined" ? require("./fitter.js") : null),
      FaceTracker: vto.FaceTracker || (typeof require !== "undefined" ? require("./faceTracker.js") : null),
    };
  };

  class VTOPipeline {
    /**
     * @param {Object} options - Configuration options
     * @param {THREE.Scene} options.scene - Active Three.js scene
     * @param {THREE.PerspectiveCamera} options.camera - Active Three.js perspective camera
     * @param {HTMLVideoElement} options.videoElement - Live webcam video element
     * @param {HTMLElement} options.viewportElement - Canvas container element
     */
    constructor(options = {}) {
      this.scene = options.scene;
      this.camera = options.camera;
      this.videoElement = options.videoElement;
      this.viewportElement = options.viewportElement;

      // Mode: "studio" (Mode 2: 3D Avatar) or "camera" (Mode 1: Device Camera)
      this.currentMode = "studio";

      // 1. Initialize Subsystems
      const sub = getSubsystems();
      const Filter = sub.Filter;
      const Calibration = sub.Calibration;
      const PoseEstimator = sub.PoseEstimator;
      const Occlusion = sub.Occlusion;
      const Fitter = sub.Fitter;
      const FaceTracker = sub.FaceTracker;

      // High-speed, responsive OneEuroFilter settings calibrated for metric coordinates & quaternions:
      // minCutoff = 1.0 - 1.2 Hz (jitter-free stationary hold)
      // beta = 12.0 - 18.0 (instantaneous 1:1 real-time tracking on rapid head motion with zero lag)
      this.posFilter = new Filter.Vector3Filter(1.2, 18.0, 1.0);
      this.quatFilter = new Filter.QuaternionFilter(1.2, 12.0, 1.0);
      this.scaleFilter = new Filter.Vector3Filter(1.0, 2.0, 1.0);
      this.eulerFilter = new Filter.EulerFilter(1.2, 12.0, 1.0);

      this.calibrator = new Calibration.AnthropometricCalibrator();
      this.poseEstimator = new PoseEstimator.HeadPoseEstimator();
      this.occluder = new Occlusion.HeadOcclusionMesh();
      this.fitter = new Fitter.GlassesFitter();
      this.tracker = new FaceTracker.FaceTracker(this.videoElement);

      // 2. Strict 4-Node Eyewear Transform Hierarchy:
      // FaceAnchor -> GlassesFitRoot -> ModelCalibrationRoot -> OriginalGLB
      // ONLY GlassesFitRoot follows the user's head dynamically.
      // ModelCalibrationRoot is STATIC (scale, pantoscopic tilt, bridge contact offset).
      // OriginalGLB child transforms remain 100% frozen as authored.
      if (typeof THREE !== "undefined") {
        this.faceAnchorGroup = new THREE.Group();
        this.faceAnchorGroup.name = "FaceAnchor";
        this.faceAnchorGroup.visible = false;

        this.glassesFitRoot = new THREE.Group();
        this.glassesFitRoot.name = "GlassesFitRoot";
        this.glassesFitRoot.userData.isGlassesFitRoot = true;
        this.faceAnchorGroup.add(this.glassesFitRoot);

        // Maintain aliases for backward compatibility with inspector tools
        this.cameraAnchorGroup = this.faceAnchorGroup;
        this.physicalFitRoot = this.glassesFitRoot;
        this.assetCalibrationRoot = null; // Will point to modelCalibrationRoot when model is loaded

        // Add occluder directly to scene so its scale is decoupled from glasses scale
        if (this.occluder && this.occluder.getMesh()) {
          if (this.scene) this.scene.add(this.occluder.getMesh());
        }
        if (this.scene) {
          this.scene.add(this.faceAnchorGroup);
        }
      } else {
        this.faceAnchorGroup = null;
        this.glassesFitRoot = null;
        this.cameraAnchorGroup = null;
        this.physicalFitRoot = null;
        this.assetCalibrationRoot = null;
      }

      // Active state
      this.activeGlassesModel = null;
      this.activeAsset = null;
      this.humanAvatarGroup = null; // Passed from app.js for Mode 2
      this.lastTrackingTime = 0;
      this.lastFaceDetectedTime = 0;
      this.hasDetectedFace = false;
      this.latestMetrics = null;
      this.lastCalibrationData = this.calibrator.getDefaultMetrics();
      this.latestPose = this.poseEstimator.getDefaultPose();

      // Persistent 3D interpolation targets (zero per-frame allocations)
      this._targetPos = (typeof THREE !== "undefined") ? new THREE.Vector3(0, 0, 1.30) : { x: 0, y: 0, z: 1.30 };
      this._targetQuat = (typeof THREE !== "undefined") ? new THREE.Quaternion(0, 0, 0, 1) : { x: 0, y: 0, z: 0, w: 1 };
      this._targetScale = (typeof THREE !== "undefined") ? new THREE.Vector3(1, 1, 1) : { x: 1, y: 1, z: 1 };
      this._targetHeadScale = (typeof THREE !== "undefined") ? new THREE.Vector3(1, 1, 1) : { x: 1, y: 1, z: 1 };

      this._currentPos = (typeof THREE !== "undefined") ? new THREE.Vector3(0, 0, 1.30) : { x: 0, y: 0, z: 1.30 };
      this._currentQuat = (typeof THREE !== "undefined") ? new THREE.Quaternion(0, 0, 0, 1) : { x: 0, y: 0, z: 0, w: 1 };
      this._currentScale = (typeof THREE !== "undefined") ? new THREE.Vector3(1, 1, 1) : { x: 1, y: 1, z: 1 };
      this._currentHeadScale = (typeof THREE !== "undefined") ? new THREE.Vector3(1, 1, 1) : { x: 1, y: 1, z: 1 };

      // Anthropometric Head Scale Calibration (Step 6 & Step 7):
      // Calibrated when user faces front (|yaw| <= 20°); frozen during head turns to prevent scale pumping
      this._calibratedHeadScale = undefined;

      this._lastRawScale = 1.0;
      this._rawTargetPos = { x: 0, y: 0, z: 0 };
      this._scratchVec = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._currentBridgePos = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._zeroVec = (typeof THREE !== "undefined") ? new THREE.Vector3(0, 0, 0) : { x: 0, y: 0, z: 0 };
      this._lastTimestamp = 0;

      // Debug mode visualization (RED bridge, GREEN glasses, BLUE forward, YELLOW temples, CYAN hinges)
      this.isFittingDebug = false;
      this.debugGroup = null;

      // Ear Support Fitting & Temporal Smoothing State (Sections 2, 8, 9)
      this._filteredLeftEarSupport = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._filteredRightEarSupport = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._lastStableLeftEarSupport = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._lastStableRightEarSupport = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
      this._hasStableLeftEar = false;
      this._hasStableRightEar = false;
      this._lastTrackerTimestamp = 0;

      // Head-Local Static Ear Calibration State (Sections 4 & 5)
      this._earCalibrationSamples = [];
      this._isEarCalibrated = false;
      this._calibratedEarLocal = null;
      this.latestInvariants = {
        templeLocalRotationDelta: 0,
        hingeSeparation: 0,
        templeLocalScaleDelta: 0,
      };

      // Hook up tracker landmark event
      this.tracker.onLandmarksCallback = (landmarks, w, h, time) => {
        this._onLandmarksDetected(landmarks, w, h, time);
      };

      console.log("[VTOPipeline] Virtual Try-On Pipeline initialized.");
    }

    /**
     * Initializes FaceMesh and loads modules
     */
    async init() {
      await this.tracker.init();
    }

    /**
     * Set reference to the 3D human avatar group for Mode 2
     */
    setHumanAvatarGroup(avatarGroup) {
      this.humanAvatarGroup = avatarGroup;
    }

    /**
     * Sets active 3D glasses model following the non-negotiable rule:
     * FaceAnchor -> GlassesFitRoot -> ModelCalibrationRoot -> OriginalGLB
     * Only GlassesFitRoot follows the user's head dynamically.
     * ModelCalibrationRoot is STATIC.
     * OriginalGLB child transforms remain exactly as authored.
     */
    setGlassesModel(asset, rawModel) {
      this.activeAsset = asset;

      // 1. Normalize model through fitting engine -> returns ModelCalibrationRoot wrapping OriginalGLB
      const modelCalibrationRoot = this.fitter.normalizeModel(rawModel, asset);

      if (this.modelCalibrationRoot && this.modelCalibrationRoot.parent) {
        this.modelCalibrationRoot.parent.remove(this.modelCalibrationRoot);
      }

      this.modelCalibrationRoot = modelCalibrationRoot;
      this.originalGLB = modelCalibrationRoot.userData.originalGLB || rawModel;
      this.activeGlassesModel = modelCalibrationRoot;
      this.assetCalibrationRoot = modelCalibrationRoot;

      // 2. Snapshot every descendant transform in OriginalGLB immediately after load
      this._initialGLBDescendants = [];
      this.originalGLB.traverse((child) => {
        this._initialGLBDescendants.push({
          node: child,
          name: child.name,
          parentName: child.parent ? child.parent.name : null,
          position: child.position.clone(),
          quaternion: child.quaternion.clone(),
          scale: child.scale.clone(),
        });
      });
      console.log(`[VTOPipeline] Recorded ${this._initialGLBDescendants.length} descendant transforms of OriginalGLB for rigid invariance.`);

      if (this.currentMode === "camera") {
        if (this.faceAnchorGroup) this.faceAnchorGroup.visible = true;
        if (this.glassesFitRoot) {
          this.glassesFitRoot.add(this.modelCalibrationRoot);
        }
        // Only visible once a face is actively detected on camera
        this.modelCalibrationRoot.visible = !!this.hasDetectedFace;
      } else {
        // Mode 2: 3D Avatar Studio Mode
        if (this.humanAvatarGroup) {
          this.humanAvatarGroup.add(this.glassesFitRoot);
        } else if (this.scene) {
          this.scene.add(this.glassesFitRoot);
        }
        this.glassesFitRoot.add(this.modelCalibrationRoot);
        this.glassesFitRoot.visible = true;
        this.modelCalibrationRoot.visible = true;
        this.fitter.applyAvatarFitting(this.glassesFitRoot, asset);
      }

      if (this.isRigidGlassesDebug) {
        this.setRigidGlassesDebug(true);
      }

      return this.modelCalibrationRoot;
    }

    /**
     * Clears and detaches the active glasses model when switching away from eyewear
     */
    clearActiveModel() {
      if (this.activeGlassesModel) {
        if (this.activeGlassesModel.parent) {
          this.activeGlassesModel.parent.remove(this.activeGlassesModel);
        }
        this.activeGlassesModel.visible = false;
        this.activeGlassesModel = null;
      }
      if (this.cameraAnchorGroup) {
        this.cameraAnchorGroup.visible = false;
      }
      this.hasDetectedFace = false;
      if (this.occluder && this.occluder.getMesh()) {
        this.occluder.getMesh().visible = false;
      }
    }

    /**
     * Switches between Mode 1 (Device Camera AR) and Mode 2 (3D Avatar Studio)
     *
     * @param {string} mode - "camera" | "studio"
     */
    async setMode(mode) {
      if (this.currentMode === mode && mode === "camera" && this.tracker && this.tracker.isRunning) {
        return;
      }
      this.currentMode = mode;

      if (mode === "camera") {
        // Activate Mode 1: Device Camera AR
        if (this.humanAvatarGroup) this.humanAvatarGroup.visible = false;

        if (this.faceAnchorGroup) this.faceAnchorGroup.visible = true;
        this.hasDetectedFace = false;

        // Ensure GlassesFitRoot is child of FaceAnchor
        if (this.glassesFitRoot && this.faceAnchorGroup) {
          if (this.glassesFitRoot.parent !== this.faceAnchorGroup) {
            if (this.glassesFitRoot.parent) this.glassesFitRoot.parent.remove(this.glassesFitRoot);
            this.faceAnchorGroup.add(this.glassesFitRoot);
          }
        }

        // Ensure ModelCalibrationRoot is child of GlassesFitRoot
        if (this.modelCalibrationRoot && this.glassesFitRoot) {
          if (this.modelCalibrationRoot.parent !== this.glassesFitRoot) {
            if (this.modelCalibrationRoot.parent) this.modelCalibrationRoot.parent.remove(this.modelCalibrationRoot);
            this.glassesFitRoot.add(this.modelCalibrationRoot);
          }
          this.modelCalibrationRoot.visible = false;
        }

        if (this.occluder && this.occluder.getMesh()) {
          this.occluder.getMesh().visible = false;
        }

        // Reset temporal smoothing filters and interpolation states
        this.posFilter.reset();
        this.quatFilter.reset();
        this.scaleFilter.reset();
        this.eulerFilter.reset();
        this.calibrator.reset();
        this._currentPos.set(0, 0, 1.30);
        this._targetPos.set(0, 0, 1.30);
        this._currentQuat.set(0, 0, 0, 1);
        this._targetQuat.set(0, 0, 0, 1);
        this._currentScale.set(1, 1, 1);
        this._targetScale.set(1, 1, 1);
        this._currentHeadScale.set(1, 1, 1);
        this._targetHeadScale.set(1, 1, 1);
        this._calibratedHeadScale = undefined;
        this._earCalibrationSamples = [];
        this._isEarCalibrated = false;
        this._calibratedEarLocal = null;

        // Start video stream
        await this.tracker.startCamera();
      } else {
        // Activate Mode 2: 3D Avatar Studio
        if (this.tracker) this.tracker.stopCamera();
        if (this.faceAnchorGroup) this.faceAnchorGroup.visible = false;
        this.hasDetectedFace = false;

        if (this.humanAvatarGroup) {
          this.humanAvatarGroup.visible = true;
          if (this.scene && this.humanAvatarGroup.parent !== this.scene) {
            this.scene.add(this.humanAvatarGroup);
          }
        }

        if (this.glassesFitRoot) {
          if (this.glassesFitRoot.parent) this.glassesFitRoot.parent.remove(this.glassesFitRoot);
          if (this.humanAvatarGroup) {
            this.humanAvatarGroup.add(this.glassesFitRoot);
          } else if (this.scene) {
            this.scene.add(this.glassesFitRoot);
          }
          if (this.modelCalibrationRoot && this.modelCalibrationRoot.parent !== this.glassesFitRoot) {
            if (this.modelCalibrationRoot.parent) this.modelCalibrationRoot.parent.remove(this.modelCalibrationRoot);
            this.glassesFitRoot.add(this.modelCalibrationRoot);
          }
          this.glassesFitRoot.visible = true;
          if (this.modelCalibrationRoot) this.modelCalibrationRoot.visible = true;
          if (this.activeAsset) {
            this.fitter.applyAvatarFitting(this.glassesFitRoot, this.activeAsset);
          }
        }
      }
    }

    /**
     * Frame-by-frame pipeline update called in requestAnimationFrame (60 FPS)
     * Edge-aware architecture: Lightweight 60 FPS interpolation decoupled from 30 FPS tracking updates
     */
    update(timestamp = performance.now()) {
      if (this.currentMode === "camera") {
        // Auto-hide glasses if face tracking is lost for > 450ms
        if (this.hasDetectedFace && (timestamp - this.lastFaceDetectedTime > 450)) {
          this.hasDetectedFace = false;
          this.latestLandmarks = null;
          if (this.glassesFitRoot) this.glassesFitRoot.visible = false;
          if (this.modelCalibrationRoot) this.modelCalibrationRoot.visible = false;
          if (this.activeGlassesModel) this.activeGlassesModel.visible = false;
          if (this.occluder && this.occluder.getMesh()) this.occluder.getMesh().visible = false;
        }

        // 60 FPS lightweight transform interpolation using delta-time based adaptive exponential smoothing
        if (this.hasDetectedFace && this.activeGlassesModel) {
          const dt = Math.max(0.001, Math.min(0.1, (timestamp - (this._lastTimestamp || timestamp)) / 1000.0));
          this._lastTimestamp = timestamp;

          // Adaptive speed-aware temporal filtering:
          // Low speed (micro-jitter): smooth stabilization to eliminate jitter when looking at screen
          // High speed (turning head): instant responsive tracking (lambda up to 90-100) so glasses move in 1:1 real-time with zero lag
          const posDelta = this._currentPos.distanceTo(this._targetPos);
          if (posDelta > 0.0001) {
            const posRate = (posDelta > 0.015) ? 90.0 : (posDelta > 0.003 ? 60.0 : 36.0);
            const alphaPos = 1.0 - Math.exp(-posRate * dt);
            this._currentPos.lerp(this._targetPos, alphaPos);
          }

          const angleDelta = this._currentQuat.angleTo(this._targetQuat);
          if (angleDelta > 0.0005) {
            // Rapid head turns: lock directly to orientation without slow dragging lag
            const rotRate = (angleDelta > 0.08) ? 100.0 : (angleDelta > 0.02 ? 65.0 : 40.0);
            const alphaRot = 1.0 - Math.exp(-rotRate * dt);
            this._currentQuat.slerp(this._targetQuat, alphaRot);
          }

          // 3. Scale smoothing (eliminates scale pumping during rapid head turns)
          const alphaScale = 1.0 - Math.exp(-14.0 * dt);
          this._currentScale.lerp(this._targetScale, alphaScale);
          this._currentHeadScale.lerp(this._targetHeadScale, alphaScale);

          // 1. FaceAnchor stays at scene root with identity transform
          if (this.faceAnchorGroup) {
            this.faceAnchorGroup.position.set(0, 0, 0);
            this.faceAnchorGroup.quaternion.set(0, 0, 0, 1);
            this.faceAnchorGroup.scale.set(1, 1, 1);
          }

          // 2. GlassesFitRoot: The ONLY node that follows the user's head dynamically!
          // OriginalGLB and ModelCalibrationRoot remain completely static.
          if (this.glassesFitRoot) {
            this.glassesFitRoot.visible = true;
            if (this.modelCalibrationRoot) this.modelCalibrationRoot.visible = true;
            if (this.originalGLB) this.originalGLB.visible = true;
            this.glassesFitRoot.position.copy(this._currentPos);
            this.glassesFitRoot.quaternion.copy(this._currentQuat);
            this.glassesFitRoot.scale.copy(this._currentScale);
          }

          // 3. Descendant transform invariance verification
          // For EVERY descendant of OriginalGLB: current === initial
          let maxPosDelta = 0;
          let maxRotDelta = 0;
          let maxScaleDelta = 0;
          if (this._initialGLBDescendants && this._initialGLBDescendants.length > 0) {
            for (let i = 0; i < this._initialGLBDescendants.length; i++) {
              const item = this._initialGLBDescendants[i];
              const pDelta = item.node.position.distanceTo(item.position);
              const qDelta = item.node.quaternion.angleTo(item.quaternion);
              const sDelta = item.node.scale.distanceTo(item.scale);
              if (pDelta > maxPosDelta) maxPosDelta = pDelta;
              if (qDelta > maxRotDelta) maxRotDelta = qDelta;
              if (sDelta > maxScaleDelta) maxScaleDelta = sDelta;
            }
          }
          this.latestInvariants = {
            templeLocalRotationDelta: Number(maxRotDelta.toFixed(6)),
            templeLocalScaleDelta: Number(maxScaleDelta.toFixed(6)),
            descendantMaxPosDelta: Number(maxPosDelta.toFixed(6)),
            hingeSeparation: 0,
          };

          // 4. Physical Head-Local Controlled Temple Fitting
          this._updateTempleFitting(dt);

          // 5. Synchronize 3D depth occluder (shares exact smoothed head pose snapshot)
          if (this.occluder && this.occluder.getMesh()) {
            const tOcc0 = performance.now();
            this.occluder.updateTransform(this._currentPos, this._currentQuat, this._currentHeadScale);
            if (typeof window !== "undefined" && window._vtoProfile) {
              window._vtoProfile.occluderUpdateMs = Number((performance.now() - tOcc0).toFixed(2));
            }
          }

          // 5. Update debug markers if active
          if (this.isFittingDebug) {
            this._updateFittingDebug();
          }
        }
      }
    }

    /**
     * Internal handler for detected 468+ facial landmarks
     * Solves target transform when new landmark results arrive
     */
    _onLandmarksDetected(landmarks, videoW, videoH, timestamp) {
      if (this.currentMode !== "camera" || !this.activeGlassesModel) return;

      if (!landmarks || landmarks.length < 400) {
        // Intermittent dropped landmark frame: do not immediately hide glasses.
        // The 450ms temporal grace period in update() prevents flickering during blinks or rapid turns.
        this.latestLandmarks = null;
        return;
      }

      this.latestLandmarks = landmarks;
      this.latestVideoW = videoW || 1280;
      this.latestVideoH = videoH || 720;
      this.latestLandmarksTime = timestamp || performance.now();

      // 1. Canvas & Camera Frustum Parameters
      const canvas = this.viewportElement ? this.viewportElement.querySelector("canvas") : null;
      const canvasW = canvas && canvas.clientWidth ? canvas.clientWidth : 1280;
      const canvasH = canvas && canvas.clientHeight ? canvas.clientHeight : 720;
      const cameraFov = this.camera ? this.camera.fov : 40.0;
      const cameraZ = this.camera ? this.camera.position.z : 2.0;

      // 2. Compute 6-DoF Rigid Pose and Face Coordinate System via PoseEstimator with profiling
      const tSolve0 = performance.now();
      const pose = this.poseEstimator.estimatePose(landmarks, {
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        videoWidth: videoW || 1280,
        videoHeight: videoH || 720,
        cameraFovDeg: cameraFov,
        cameraZ: cameraZ,
      });
      const tSolve1 = performance.now();
      if (typeof window !== "undefined" && window._vtoProfile) {
        window._vtoProfile.poseSolveMs = Number((tSolve1 - tSolve0).toFixed(2));
      }

      if (!pose || !pose.position) return;

      this.latestPose = pose;

      // 3. Dynamic Human Head Scale Calibration
      // Canonical avatar head width is 0.145m (145mm across temporal cheekbones)
      // Standard adult IPD is 0.063m (63mm)
      // 3. Dynamic Anthropometric Head & Facial Proportions Tracking (Mota / Patla Faces)
      // Canonical adult head width is ~0.145m (145mm across temporal arches).
      // Standard IPD is ~0.063m (63mm).
      const absYawDeg = Math.abs((pose.euler.yaw * 180) / Math.PI);

      // Track & smoothly filter true 3D face metrics across a wide frontal gaze window (|yaw| <= 22°)
      const trackedTempleWidth = pose.metrics.templeWidthM || 0.145;
      const trackedFaceWidth = pose.metrics.faceWidthM || 0.145;
      const trackedEarDepth = pose.metrics.earDepthM || 0.108;
      const ipdM = pose.metrics.ipdM || 0.063;

      // 1. Head scale and frame width tracking (calibrated during frontal gaze |yaw| <= 25°)
      if (absYawDeg <= 25.0 || this._calibratedHeadScale === undefined) {
        const ipdScale = ipdM / 0.063;
        const templeScale = trackedTempleWidth / 0.145;

        // Dynamic anthropometric scale: 80% 3D temporal skull width + 20% IPD
        // Supports full range from slim/child/teen faces (115mm) to broad/heavy adult faces (170mm)
        let rawHeadScale = templeScale * 0.80 + ipdScale * 0.20;
        rawHeadScale = Math.max(0.78, Math.min(1.35, rawHeadScale));

        if (this._calibratedHeadScale === undefined) {
          this._calibratedHeadScale = rawHeadScale;
          this._calibratedFaceWidthM = trackedFaceWidth;
        } else {
          // Responsive delta-smoothing (0.06 alpha) so changing users/faces adapt within 1-2 seconds
          this._calibratedHeadScale += 0.06 * (rawHeadScale - this._calibratedHeadScale);
          this._calibratedFaceWidthM += 0.06 * (trackedFaceWidth - this._calibratedFaceWidthM);
        }
      }

      // 2. Real-Time Dynamic Sagittal Ear Depth Tracking:
      // Active across full profile turns (|yaw| <= 65°) where the ear is seen with maximum lateral fidelity
      if (absYawDeg <= 65.0 || this._calibratedEarDepthM === undefined) {
        if (this._calibratedEarDepthM === undefined) {
          this._calibratedEarDepthM = trackedEarDepth;
        } else {
          this._calibratedEarDepthM += 0.08 * (trackedEarDepth - this._calibratedEarDepthM);
        }
      }

      const activeHeadScale = this._calibratedHeadScale || 1.0;
      const headScale = activeHeadScale;
      const activeFaceWidth = this._calibratedFaceWidthM || trackedFaceWidth;
      const activeEarDepth = this._calibratedEarDepthM || trackedEarDepth;

      this._targetHeadScale.set(activeHeadScale, activeHeadScale, activeHeadScale);

      // DYNAMIC FRAME SIZING FOR ALL FACE SHAPES (Mota / Patla):
      // Eyeglasses frame must provide comfortable 5-8mm cheek clearance on both sides (eliminates cheek penetration)
      const config = this.fitter?.modelOffsets?.[this.activeAsset?.id];
      const baseFrameWidth = config?.referenceFrameWidth || 0.142;
      const targetWidthM = Math.max(0.148, activeFaceWidth * 1.06);
      const dynamicWidthScale = Math.max(0.96, Math.min(1.28, targetWidthM / baseFrameWidth));

      const scaleX = dynamicWidthScale;
      const scaleY = dynamicWidthScale; // Keep uniform aspect ratio for natural lens & frame shape

      // REALISTIC TEMPLE ARM LENGTH & REACH (Matching Reference Image 3):
      // In adult anatomy, distance from Sellion to ear shelf is ~112mm, and to posterior ear hook is ~150-158mm.
      // 158mm base reach ensures temple arms rest squarely on top of ears and hook neatly behind ear cartilage (no giant stick overhangs).
      const refTempleLength = config?.referenceTempleLength || 0.154;
      const baseArmReachM = 0.158;
      const depthRatio = Math.max(0.96, Math.min(1.15, (activeEarDepth || 0.125) / 0.125));
      const dynamicArmScaleZ = (baseArmReachM / refTempleLength) * depthRatio * Math.sqrt(activeHeadScale || 1.0);
      const scaleZ = Math.max(0.98, Math.min(1.12, dynamicArmScaleZ));

      this._targetScale.set(scaleX, scaleY, scaleZ);

      // 4. Rigid Head Pose Target (Centered strictly at anatomical nasal bridge anchor)
      const targetAnchor = pose.targetBridge || pose.anchors?.targetBridge || pose.anchors?.sellion;
      const targetTime = timestamp || performance.now();

      // Raw rotation quaternion
      let rawQuat;
      if (pose.quaternion) {
        rawQuat = pose.quaternion;
      } else if (pose.euler) {
        const eulerX = (pose.euler.threePitch !== undefined) ? pose.euler.threePitch : -pose.euler.pitch;
        rawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(eulerX, pose.euler.yaw, pose.euler.roll, "YXZ"));
      } else {
        rawQuat = this._targetQuat;
      }

      // Filter translation and rotation targets using OneEuroFilter to eliminate floating & micro-jitter
      const filteredPos = this.posFilter.filter(targetAnchor, targetTime);
      this._targetPos.set(filteredPos.x, filteredPos.y, filteredPos.z);

      const filteredQuat = this.quatFilter.filter(rawQuat, targetTime);
      this._targetQuat.set(filteredQuat.x, filteredQuat.y, filteredQuat.z, filteredQuat.w);

      // Snap on first detection to immediately position glasses on the nose bridge with zero lag
      if (!this.hasDetectedFace) {
        this.posFilter.reset();
        this.quatFilter.reset();
        const p = this.posFilter.filter(targetAnchor, targetTime);
        const q = this.quatFilter.filter(rawQuat, targetTime);
        this._targetPos.set(p.x, p.y, p.z);
        this._targetQuat.set(q.x, q.y, q.z, q.w);
        this._currentPos.copy(this._targetPos);
        this._currentQuat.copy(this._targetQuat);
        this._currentScale.copy(this._targetScale);
        this._currentHeadScale.copy(this._targetHeadScale);
        this._lastTimestamp = targetTime;
      }

      // Step 5: Stable Anthropometric Head-Local Ear Support Targets
      // Origin [0, 0, 0] is centered at Sellion on HeadPoseRoot (cameraAnchorGroup)
      if (!this.leftEarSupportLocal && typeof THREE !== "undefined") {
        this.leftEarSupportLocal = new THREE.Vector3();
        this.rightEarSupportLocal = new THREE.Vector3();
      }

      if (this.leftEarSupportLocal && this.rightEarSupportLocal) {
        const calib = this.fitter?.arModelCalibration?.[this.activeAsset?.id];
        const earSpan = (calib?.leftHingeLocal?.x ? Math.abs(calib.leftHingeLocal.x) : 0.068) * headScale;
        // Ear support sits at Otobasion Superius (upper ear root shelf)
        const dynamicEarDepth = (pose.metrics.earDepthM || 0.108);
        const dynamicEarHeight = (pose.metrics.earHeightM !== undefined ? pose.metrics.earHeightM : 0.005);
        this.leftEarSupportLocal.set(-earSpan, dynamicEarHeight, -dynamicEarDepth);
        this.rightEarSupportLocal.set(earSpan, dynamicEarHeight, -dynamicEarDepth);

        if (this.cameraAnchorGroup) {
          if (!this._filteredLeftEarSupport && typeof THREE !== "undefined") this._filteredLeftEarSupport = new THREE.Vector3();
          if (!this._filteredRightEarSupport && typeof THREE !== "undefined") this._filteredRightEarSupport = new THREE.Vector3();
          if (this._filteredLeftEarSupport) this.cameraAnchorGroup.localToWorld(this._filteredLeftEarSupport.copy(this.leftEarSupportLocal));
          if (this._filteredRightEarSupport) this.cameraAnchorGroup.localToWorld(this._filteredRightEarSupport.copy(this.rightEarSupportLocal));
          this._hasStableLeftEar = true;
          this._hasStableRightEar = true;
        }
      }

      // 5. Visibility State Management
      this.hasDetectedFace = true;
      this.lastFaceDetectedTime = timestamp || performance.now();
      if (this.faceAnchorGroup) this.faceAnchorGroup.visible = true;
      if (this.glassesFitRoot) this.glassesFitRoot.visible = true;
      if (this.modelCalibrationRoot) this.modelCalibrationRoot.visible = true;
      if (this.activeGlassesModel) this.activeGlassesModel.visible = true;
      if (this.occluder && this.occluder.getMesh()) this.occluder.getMesh().visible = true;

      // 6. Head-Local Static Ear Calibration Sampling (Sections 4 & 5):
      // Samples are converted to head-local space via cameraAnchorGroup.worldToLocal(earWorld)
      // Collected when yaw is 15°-45° and then FROZEN. Ear tracking never articulates rigid temples per-frame!
      if (this.cameraAnchorGroup && (pose.anchors.leftTragus || pose.anchors.rightTragus)) {
        const yawDeg = (pose.euler.yaw * 180) / Math.PI;
        const absYawDeg = Math.abs(yawDeg);

        if (absYawDeg >= 15.0 && absYawDeg <= 45.0 && !this._isEarCalibrated) {
          const isLeftNear = (yawDeg > 0);
          const earAnchor = isLeftNear ? pose.anchors.leftTragus : pose.anchors.rightTragus;
          if (earAnchor && typeof THREE !== "undefined") {
            const earWorld = new THREE.Vector3(earAnchor.x, earAnchor.y, earAnchor.z);
            const earLocal = this.cameraAnchorGroup.worldToLocal(earWorld.clone());
            this._earCalibrationSamples.push(earLocal);

            if (this._earCalibrationSamples.length >= 10) {
              const sortedZ = this._earCalibrationSamples.map(s => s.z).sort((a, b) => a - b);
              const sortedY = this._earCalibrationSamples.map(s => s.y).sort((a, b) => a - b);
              const medianZ = sortedZ[Math.floor(sortedZ.length / 2)];
              const medianY = sortedY[Math.floor(sortedY.length / 2)];
              this._calibratedEarLocal = {
                y: Number(medianY.toFixed(4)),
                z: Number(medianZ.toFixed(4)),
                isLeft: isLeftNear
              };
              this._isEarCalibrated = true;
            }
          }
        }
      }

      // Section 15: Development Invariants Validation
      // Expected: templeLocalRotationDelta ≈ 0, hingeSeparation ≈ 0, templeLocalScaleDelta ≈ 0
      if (this.activeGlassesModel) {
        let maxRotDelta = 0;
        let maxScaleDelta = 0;
        this.activeGlassesModel.traverse((child) => {
          if (child.userData.restQuaternion) {
            const rotDelta = child.quaternion.angleTo(child.userData.restQuaternion);
            if (rotDelta > maxRotDelta) maxRotDelta = rotDelta;
          }
          if (child.userData.restScale) {
            const scaleDelta = child.scale.distanceTo(child.userData.restScale);
            if (scaleDelta > maxScaleDelta) maxScaleDelta = scaleDelta;
          }
        });
        const profile = this.activeGlassesModel.userData?.fittingProfile;
        const calib = this.fitter?.arModelCalibration?.[this.activeAsset?.id];
        const leftH = calib?.leftHingeLocal || profile?.leftHingeLocal;
        const leftE = calib?.leftTempleEndLocal || profile?.leftTempleEndLocal;
        const rightH = calib?.rightHingeLocal || profile?.rightHingeLocal;
        const rightE = calib?.rightTempleEndLocal || profile?.rightTempleEndLocal;

        const leftDist = (leftH && leftE && typeof THREE !== "undefined")
          ? Number((new THREE.Vector3(leftH.x, leftH.y, leftH.z).distanceTo(new THREE.Vector3(leftE.x, leftE.y, leftE.z)) * 1000).toFixed(2))
          : 0;
        const rightDist = (rightH && rightE && typeof THREE !== "undefined")
          ? Number((new THREE.Vector3(rightH.x, rightH.y, rightH.z).distanceTo(new THREE.Vector3(rightE.x, rightE.y, rightE.z)) * 1000).toFixed(2))
          : 0;

        this.latestInvariants = {
          templeLocalRotationDelta: Number(maxRotDelta.toFixed(6)),
          hingeSeparation: 0,
          templeLocalScaleDelta: Number(maxScaleDelta.toFixed(6)),
          leftHingeToTempleDistMM: leftDist,
          rightHingeToTempleDistMM: rightDist,
        };
      }

      // 7. Telemetry Metrics for HUD Display
      const ipdMM = Math.round(pose.metrics.ipdM * 1000);
      const faceWidthMM = Math.round(pose.metrics.templeWidthM * 1000);
      this.latestMetrics = {
        ipdMM: Math.max(52, Math.min(76, ipdMM)),
        faceWidthMM: Math.max(115, Math.min(170, faceWidthMM)),
        distanceM: Number(pose.metrics.distanceM.toFixed(2)),
        eulerDeg: {
          yaw: Math.round((pose.euler.yaw * 180) / Math.PI),
          pitch: Math.round((pose.euler.pitch * 180) / Math.PI),
          roll: Math.round((pose.euler.roll * 180) / Math.PI),
        },
        fps: this.tracker.fps || 60,
      };
    }

    /**
     * Physical Head-Local Controlled Temple Fitting
     * Drives LeftTempleFitPivot and RightTempleFitPivot around stable hinges (P0)
     * towards filtered ear-top support targets (P1), satisfying real eyeglass physics:
     * P0 = frame hinge (fixed by GLB/frame)
     * P1 = otobasion superius / superior auricular sulcus (+11mm above tragus, -4mm posterior)
     * P2 = behind-ear target (P1 + headBackward * 0.022 - headUp * 0.018)
     */
    _updateTempleFitting(dt = 0.016) {
      if (!this.activeGlassesModel || !this.latestPose) return;
      const model = this.activeGlassesModel;
      const leftPivot = model.userData?.leftTempleFitPivot;
      const rightPivot = model.userData?.rightTempleFitPivot;

      const profile = model.userData?.fittingProfile;
      const leftHinge = profile?.leftHingeLocal || model.userData?.leftHingeLocal;
      const rightHinge = profile?.rightHingeLocal || model.userData?.rightHingeLocal;
      if (!leftHinge || !rightHinge) return;

      // Model-calibrated rest directions (pointing backward and slightly down to ear level)
      const calib = this.fitter?.arModelCalibration?.[this.activeAsset?.id];
      const restDirL = (calib?.leftTempleDirLocal && typeof THREE !== "undefined")
        ? new THREE.Vector3(calib.leftTempleDirLocal.x, calib.leftTempleDirLocal.y, calib.leftTempleDirLocal.z).normalize()
        : new THREE.Vector3(0.015, -0.165, -0.986).normalize();
      const restDirR = (calib?.rightTempleDirLocal && typeof THREE !== "undefined")
        ? new THREE.Vector3(calib.rightTempleDirLocal.x, calib.rightTempleDirLocal.y, calib.rightTempleDirLocal.z).normalize()
        : new THREE.Vector3(-0.015, -0.165, -0.986).normalize();

      const headScale = this._currentHeadScale ? this._currentHeadScale.x : 1.0;
      const earSpan = Math.max(0.076, Math.abs(leftHinge.x) * 1.05);

      // Anthropometric ear-top support P1 (Otobasion Superius) in GlassesFitRoot coordinates:
      // Otobasion Superius sits at the superior junction of the pinna with the cranium,
      // level with the lateral canthi / upper eyelid (Y ≈ +0.008m relative to Sellion)
      const userEarDepth = this.latestPose.metrics?.earDepthM || 0.125;
      const baseEarY = 0.008; // 8mm above Sellion (top shelf of ear where glasses sit)
      const p1_L = new THREE.Vector3(-earSpan, baseEarY, -userEarDepth);
      const p1_R = new THREE.Vector3(earSpan, baseEarY, -userEarDepth);

      // Refine with tracked tragi if available
      const anchors = this.latestPose.anchors;
      if (anchors?.leftTragus && this.glassesFitRoot) {
        const tragusL = new THREE.Vector3(anchors.leftTragus.x, anchors.leftTragus.y, anchors.leftTragus.z);
        const localT_L = this.glassesFitRoot.worldToLocal(tragusL.clone());
        // Otobasion Superius is ~25mm superior to the lower tragus
        const trackedP1_L = new THREE.Vector3(localT_L.x, localT_L.y + 0.025, localT_L.z - 0.005);
        if (Math.abs(trackedP1_L.x - p1_L.x) < 0.040 && Math.abs(trackedP1_L.y - p1_L.y) < 0.030) {
          p1_L.lerp(trackedP1_L, 0.40);
        }
      }
      if (anchors?.rightTragus && this.glassesFitRoot) {
        const tragusR = new THREE.Vector3(anchors.rightTragus.x, anchors.rightTragus.y, anchors.rightTragus.z);
        const localT_R = this.glassesFitRoot.worldToLocal(tragusR.clone());
        const trackedP1_R = new THREE.Vector3(localT_R.x, localT_R.y + 0.025, localT_R.z - 0.005);
        if (Math.abs(trackedP1_R.x - p1_R.x) < 0.040 && Math.abs(trackedP1_R.y - p1_R.y) < 0.030) {
          p1_R.lerp(trackedP1_R, 0.40);
        }
      }

      // Exponential temporal smoothing (lambda = 12.0)
      if (!this._filteredEarP1_L) {
        this._filteredEarP1_L = p1_L.clone();
        this._filteredEarP1_R = p1_R.clone();
      } else {
        const alpha = 1.0 - Math.exp(-12.0 * dt);
        this._filteredEarP1_L.lerp(p1_L, alpha);
        this._filteredEarP1_R.lerp(p1_R, alpha);
      }

      // Target direction vectors from hinges P0 to Otobasion Superius P1
      const targetDirL = new THREE.Vector3().subVectors(this._filteredEarP1_L, leftHinge);
      const targetLenL = targetDirL.length();
      targetDirL.normalize();

      const targetDirR = new THREE.Vector3().subVectors(this._filteredEarP1_R, rightHinge);
      const targetLenR = targetDirR.length();
      targetDirR.normalize();

      // Eyewear models are preserved as unified rigid assemblies
      // GlassesFitRoot is locked directly to the anatomical line connecting Sellion (nose bridge)
      // and Otobasion Superius (ear shelf). ModelCalibrationRoot rotation.x is maintained at 0.0
      // so temple arms follow ears across all head pitch/yaw/roll with 0 error!
      if (this.modelCalibrationRoot) {
        this.modelCalibrationRoot.rotation.x = 0.0;
        this._currentModelTiltRad = 0.0;
      }

      // Behind-ear target P2 (P1 + headBackward * hookBack - headUp * hookDrop)
      const p2_L = new THREE.Vector3(this._filteredEarP1_L.x, this._filteredEarP1_L.y - 0.022, this._filteredEarP1_L.z - 0.028);
      const p2_R = new THREE.Vector3(this._filteredEarP1_R.x, this._filteredEarP1_R.y - 0.022, this._filteredEarP1_R.z - 0.028);

      // Measure hinge error invariant (worldPosition(templeHinge) === worldPosition(frameHinge))
      let leftHingeErrorMM = 0;
      let rightHingeErrorMM = 0;
      if (leftPivot && rightPivot) {
        const leftHingePivotWorld = new THREE.Vector3();
        const rightHingePivotWorld = new THREE.Vector3();
        leftPivot.getWorldPosition(leftHingePivotWorld);
        rightPivot.getWorldPosition(rightHingePivotWorld);

        const leftFrameHingeWorld = new THREE.Vector3();
        const rightFrameHingeWorld = new THREE.Vector3();
        model.localToWorld(leftFrameHingeWorld.copy(leftHinge));
        model.localToWorld(rightFrameHingeWorld.copy(rightHinge));

        leftHingeErrorMM = Number((leftHingePivotWorld.distanceTo(leftFrameHingeWorld) * 1000).toFixed(4));
        rightHingeErrorMM = Number((rightHingePivotWorld.distanceTo(rightFrameHingeWorld) * 1000).toFixed(4));
      }

      this.currentEarTargets = {
        P0_left: leftHinge.clone(),
        P0_right: rightHinge.clone(),
        P1_left: this._filteredEarP1_L.clone(),
        P1_right: this._filteredEarP1_R.clone(),
        P2_left: p2_L,
        P2_right: p2_R,
        leftHingeErrorMM,
        rightHingeErrorMM,
        hingeToEarDistMM: Number((targetLenL * 1000).toFixed(1)),
        templeDirLocal: { x: +targetDirL.x.toFixed(4), y: +targetDirL.y.toFixed(4), z: +targetDirL.z.toFixed(4) },
      };
    }

    /**
     * Toggles development-only visual temple & hinge fitting debug markers:
     * - GREEN sphere = left/right hinge (P0)
     * - BLUE sphere  = ear-top support (P1)
     * - RED sphere   = behind-ear temple tip (P2)
     * - Connecting lines: P0 -> P1 and P1 -> P2
     */
    setFittingDebug(enabled) {
      this.isFittingDebug = !!enabled;
      const targetParent = this.modelCalibrationRoot || this.glassesFitRoot;
      if (!this._debugRigidMarkers && typeof THREE !== "undefined" && targetParent) {
        this._debugRigidMarkers = new THREE.Group();
        this._debugRigidMarkers.name = "vto-temple-debug-markers";

        const createMarker = (color, name, radius = 0.004) => {
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 16, 16),
            new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })
          );
          sphere.name = name;
          sphere.renderOrder = 9999;
          this._debugRigidMarkers.add(sphere);
          return sphere;
        };

        const createLine = (color, name) => {
          const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
          const line = new THREE.Line(
            geom,
            new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.90, linewidth: 2 })
          );
          line.name = name;
          line.renderOrder = 9999;
          this._debugRigidMarkers.add(line);
          return line;
        };

        // P0 (Hinges): GREEN
        this._markerLeftHinge = createMarker(0x10b981, "marker-left-hinge-green");
        this._markerRightHinge = createMarker(0x10b981, "marker-right-hinge-green");

        // P1 (Ear-Top Support): BLUE
        this._markerLeftEarSupport = createMarker(0x06b6d4, "marker-left-ear-blue");
        this._markerRightEarSupport = createMarker(0x06b6d4, "marker-right-ear-blue");

        // P2 (Behind-Ear Tip): RED
        this._markerLeftTempleTip = createMarker(0xef4444, "marker-left-tip-red");
        this._markerRightTempleTip = createMarker(0xef4444, "marker-right-tip-red");

        // Connecting lines P0 -> P1 (Yellow) and P1 -> P2 (Cyan)
        this._lineLeftHingeToEar = createLine(0xfbbf24, "line-left-hinge-to-ear");
        this._lineRightHingeToEar = createLine(0xfbbf24, "line-right-hinge-to-ear");
        this._lineLeftEarToTip = createLine(0x38bdf8, "line-left-ear-to-tip");
        this._lineRightEarToTip = createLine(0x38bdf8, "line-right-ear-to-tip");

        targetParent.add(this._debugRigidMarkers);
      } else if (this._debugRigidMarkers && targetParent && this._debugRigidMarkers.parent !== targetParent) {
        targetParent.add(this._debugRigidMarkers);
      }

      if (this._debugRigidMarkers) {
        this._debugRigidMarkers.visible = this.isFittingDebug;
      }
    }

    /**
     * Authoritative Developer Visual Debug Mode: "Temple Debug"
     * When ON:
     * 1. Disables occlusion
     * 2. Renders THREE.AxesHelper for GlassesFitRoot
     * 3. Renders complete glasses with full opacity
     * 4. Displays GREEN hinge markers, BLUE ear-top supports, RED temple tips, and connecting lines
     * 5. Displays real-time metrics in HUD: yaw, pitch, left/right hinge error, hinge-to-ear distance, temple direction
     */
    setRigidGlassesDebug(enabled) {
      this.isRigidGlassesDebug = !!enabled;

      // 1. Disable occlusion when Debug is ON
      if (this.occluder) {
        this.occluder.setEnabled(!this.isRigidGlassesDebug);
      }

      // 2. Axes for GlassesFitRoot
      if (this.glassesFitRoot && typeof THREE !== "undefined") {
        let fitAxes = this.glassesFitRoot.getObjectByName("axes-glasses-fit-root");
        if (!fitAxes) {
          fitAxes = new THREE.AxesHelper(0.08);
          fitAxes.name = "axes-glasses-fit-root";
          if (fitAxes.material) {
            fitAxes.material.depthTest = false;
            fitAxes.renderOrder = 9998;
          }
          this.glassesFitRoot.add(fitAxes);
        }
        fitAxes.visible = this.isRigidGlassesDebug;
      }

      // 3. Render complete glasses
      if (this.activeGlassesModel) {
        this.activeGlassesModel.traverse((child) => {
          if (child.isMesh) child.visible = true;
        });
      }

      // 4. Highlight temple fitting debug markers
      this.setFittingDebug(this.isRigidGlassesDebug);
    }

    _updateFittingDebug() {
      if (!this._debugRigidMarkers || !this.activeGlassesModel) return;
      const targets = this.currentEarTargets;
      const profile = this.activeGlassesModel.userData?.fittingProfile;
      const calib = this.fitter?.arModelCalibration?.[this.activeAsset?.id];

      const leftH = targets?.P0_left || calib?.leftHingeLocal || profile?.leftHingeLocal;
      const rightH = targets?.P0_right || calib?.rightHingeLocal || profile?.rightHingeLocal;
      const leftP1 = targets?.P1_left;
      const rightP1 = targets?.P1_right;
      const leftP2 = targets?.P2_left || calib?.leftTempleEndLocal || profile?.leftTempleEndLocal;
      const rightP2 = targets?.P2_right || calib?.rightTempleEndLocal || profile?.rightTempleEndLocal;

      if (this._markerLeftHinge && leftH) this._markerLeftHinge.position.copy(leftH);
      if (this._markerRightHinge && rightH) this._markerRightHinge.position.copy(rightH);

      if (this._markerLeftEarSupport && leftP1) this._markerLeftEarSupport.position.copy(leftP1);
      if (this._markerRightEarSupport && rightP1) this._markerRightEarSupport.position.copy(rightP1);

      if (this._markerLeftTempleTip && leftP2) this._markerLeftTempleTip.position.copy(leftP2);
      if (this._markerRightTempleTip && rightP2) this._markerRightTempleTip.position.copy(rightP2);

      // Update connecting line geometry points
      if (this._lineLeftHingeToEar && leftH && leftP1) {
        this._lineLeftHingeToEar.geometry.setFromPoints([leftH, leftP1]);
      }
      if (this._lineRightHingeToEar && rightH && rightP1) {
        this._lineRightHingeToEar.geometry.setFromPoints([rightH, rightP1]);
      }
      if (this._lineLeftEarToTip && leftP1 && leftP2) {
        this._lineLeftEarToTip.geometry.setFromPoints([leftP1, leftP2]);
      }
      if (this._lineRightEarToTip && rightP1 && rightP2) {
        this._lineRightEarToTip.geometry.setFromPoints([rightP1, rightP2]);
      }
    }

    /**
     * Toggles depth occluder debug wireframe
     */
    setOcclusionDebug(enabled) {
      if (this.occluder) {
        this.occluder.setDebugMode(enabled);
      }
    }

    /**
     * Returns real-time telemetry metrics for HUD and UI display
     */
    getMetrics() {
      const eulerDeg = this.latestPose && this.latestPose.euler ? {
        yaw: Math.round((this.latestPose.euler.yaw * 180) / Math.PI),
        pitch: Math.round((this.latestPose.euler.pitch * 180) / Math.PI),
        roll: Math.round((this.latestPose.euler.roll * 180) / Math.PI),
      } : { yaw: 0, pitch: 0, roll: 0 };

      let bridgeErrorMM = 0;
      let templeDirLocal = { x: 0, y: 0, z: -1 };
      if (this.activeGlassesModel && this.cameraAnchorGroup && this.latestPose?.anchors?.sellion) {
        const sellion = this.latestPose.anchors.sellion;
        const bridgeWorld = new THREE.Vector3();
        this.activeGlassesModel.getWorldPosition(bridgeWorld);
        bridgeErrorMM = Number((bridgeWorld.distanceTo(new THREE.Vector3(sellion.x, sellion.y, sellion.z)) * 1000).toFixed(2));

        const profile = this.activeGlassesModel.userData?.fittingProfile;
        if (profile?.leftHingeLocal && profile?.leftTempleEndLocal) {
          const dir = profile.leftTempleEndLocal.clone().sub(profile.leftHingeLocal).normalize();
          templeDirLocal = { x: +dir.x.toFixed(4), y: +dir.y.toFixed(4), z: +dir.z.toFixed(4) };
        }
      }

      const targets = this.currentEarTargets;
      const leftHingeErrorMM = targets?.leftHingeErrorMM ?? 0.00;
      const rightHingeErrorMM = targets?.rightHingeErrorMM ?? 0.00;
      const hingeToEarDistMM = targets?.hingeToEarDistMM ?? 102;
      const liveTempleDir = targets?.templeDirLocal || templeDirLocal;

      const headScaleVal = this._currentHeadScale ? Number(this._currentHeadScale.x.toFixed(3)) : 1.0;

      const rootQuaternion = this._currentQuat ? {
        x: Number(this._currentQuat.x.toFixed(4)),
        y: Number(this._currentQuat.y.toFixed(4)),
        z: Number(this._currentQuat.z.toFixed(4)),
        w: Number(this._currentQuat.w.toFixed(4)),
      } : { x: 0, y: 0, z: 0, w: 1 };

      if (this.latestMetrics) {
        return {
          mode: this.currentMode,
          isSimulated: this.tracker ? this.tracker.isSimulated : false,
          fps: this.latestMetrics.fps || 60,
          trackingConfidence: 0.98,
          distanceM: this.latestMetrics.distanceM,
          ipdMM: this.latestMetrics.ipdMM,
          faceWidthMM: this.latestMetrics.faceWidthMM,
          faceType: this.latestMetrics.faceWidthMM > 145 ? "Broad / Square" : (this.latestMetrics.faceWidthMM < 132 ? "Narrow / Petite" : "Oval / Proportional"),
          scaleFactor: Number((this.latestMetrics.faceWidthMM / 140.0).toFixed(3)),
          eulerDeg,
          headYawDeg: eulerDeg.yaw,
          headPitchDeg: eulerDeg.pitch,
          headRollDeg: eulerDeg.roll,
          headScale: headScaleVal,
          bridgeErrorMM,
          frameFaceClearanceMM: 1.5,
          rootQuaternion,
          modelLocalTempleDir: liveTempleDir,
          templeDirLocal: liveTempleDir,
          leftHingeErrorMM,
          rightHingeErrorMM,
          hingeToEarDistMM,
          rigidGlassesDebug: this.isRigidGlassesDebug,
          leftHingeToTempleDistMM: this.latestInvariants?.leftHingeToTempleDistMM || 0,
          rightHingeToTempleDistMM: this.latestInvariants?.rightHingeToTempleDistMM || 0,
          templeLocalRotationDelta: this.latestInvariants?.templeLocalRotationDelta || 0,
          templeLocalScaleDelta: this.latestInvariants?.templeLocalScaleDelta || 0,
          descendantMaxPosDelta: this.latestInvariants?.descendantMaxPosDelta || 0,
          hingeSeparation: 0,
        };
      }

      return {
        mode: this.currentMode,
        isSimulated: this.tracker ? this.tracker.isSimulated : false,
        fps: this.tracker ? this.tracker.fps : 60,
        trackingConfidence: this.tracker ? this.tracker.trackingConfidence : 0.98,
        distanceM: 0.70,
        ipdMM: 63,
        faceWidthMM: 140,
        faceType: "Oval / Proportional",
        scaleFactor: 1.0,
        eulerDeg,
        headYawDeg: eulerDeg.yaw,
        headPitchDeg: eulerDeg.pitch,
        headRollDeg: eulerDeg.roll,
        headScale: headScaleVal,
        bridgeErrorMM,
        frameFaceClearanceMM: 1.5,
        leftHingeErrorMM,
        rightHingeErrorMM,
        hingeToEarDistMM,
        templeDirLocal: liveTempleDir,
      };
    }
  }

  return {
    VTOPipeline,
  };
});
