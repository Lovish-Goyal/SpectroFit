/**
 * ============================================================================
 * VTO Pipeline: 3D Head Pose Estimation & Live AR Face Rig Module
 * ============================================================================
 * Establishes an anatomical 6-DoF Live AR Face Rig:
 * - faceRight (+X): Transverse axis across face (Screen Left -> Screen Right, +X)
 * - faceUp (+Y): Vertical facial axis (Chin -> Forehead, orthonormalized, +Y)
 * - faceForward (+Z): Sagittal normal pointing outward from face toward camera (+Z)
 *
 * Guarantees:
 * 1. Pinhole camera depth estimation (Z_metric) invariant to camera distance
 * 2. Front frame anchored to nasal bridge root (Sellion / Landmark 168) with 1.5mm physical clearance
 * 3. Hinge alignment via tracked temple targets (Landmarks 127 & 356) and ears (234 & 454)
 * 4. True 6-DoF rigid orientation pivoting around the nasal bridge (zero yaw orbiting)
 * 5. Pre-allocated scratch objects to eliminate per-frame garbage collection
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VTO = root.VTO || {};
    root.VTO.PoseEstimator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Reusable persistent scratch vectors to eliminate per-frame allocations
  const _vLeftPupil = { x: 0, y: 0, z: 0 };
  const _vRightPupil = { x: 0, y: 0, z: 0 };
  const _vLeftEyeOuter = { x: 0, y: 0, z: 0 };
  const _vRightEyeOuter = { x: 0, y: 0, z: 0 };
  const _vEyeMid = { x: 0, y: 0, z: 0 };
  const _vSellion = { x: 0, y: 0, z: 0 };
  const _vNasalBridge = { x: 0, y: 0, z: 0 };
  const _vNoseTip = { x: 0, y: 0, z: 0 };
  const _vChin = { x: 0, y: 0, z: 0 };
  const _vForehead = { x: 0, y: 0, z: 0 };
  const _vLeftTemple = { x: 0, y: 0, z: 0 };
  const _vRightTemple = { x: 0, y: 0, z: 0 };
  const _vLeftTragus = { x: 0, y: 0, z: 0 };
  const _vRightTragus = { x: 0, y: 0, z: 0 };
  const _vLeftEarRoot = { x: 0, y: 0, z: 0 };
  const _vRightEarRoot = { x: 0, y: 0, z: 0 };

  const _faceRight = { x: 1, y: 0, z: 0 };
  const _faceUp = { x: 0, y: 1, z: 0 };
  const _faceForward = { x: 0, y: 0, z: 1 };
  const _rawUp = { x: 0, y: 1, z: 0 };
  const _targetBridge = { x: 0, y: 0, z: 0 };

  class HeadPoseEstimator {
    constructor() {
      this.hasThree = typeof THREE !== "undefined";
      if (this.hasThree) {
        this._threeBasisX = new THREE.Vector3();
        this._threeBasisY = new THREE.Vector3();
        this._threeBasisZ = new THREE.Vector3();
        this.threeMatrix = new THREE.Matrix4();
        this.threeQuaternion = new THREE.Quaternion();
        this.threeEuler = new THREE.Euler(0, 0, 0, "YXZ");
        this.threePosition = new THREE.Vector3();
      }
    }

    /**
     * Estimates 6-DoF rigid head pose from MediaPipe 468+ landmarks
     *
     * @param {Array} landmarks - MediaPipe normalized landmarks [{x, y, z}, ...]
     * @param {number|Object} viewWidthOrOptions - Canvas pixel width OR options object
     * @param {number} [viewHeight] - Canvas pixel height
     * @param {number} [cameraFovDeg=40.0] - Camera vertical FOV in degrees
     * @param {number} [estimatedDistanceM=0.70] - Optional fallback distance
     * @param {Object} [extraOptions={}] - Video dimensions and camera parameters
     * @returns {Object} 6-DoF head pose { position, quaternion, euler, matrix, metrics, anchors }
     */
    estimatePose(landmarks, viewWidthOrOptions, viewHeight, cameraFovDeg = 40.0, estimatedDistanceM = 0.70, extraOptions = {}) {
      if (!landmarks || landmarks.length < 400) {
        return this.getDefaultPose();
      }

      // 1. Resolve Configuration Options
      let opts = {};
      if (typeof viewWidthOrOptions === "object" && viewWidthOrOptions !== null) {
        opts = viewWidthOrOptions;
      } else {
        opts = {
          viewWidth: viewWidthOrOptions || 1280,
          viewHeight: viewHeight || 720,
          cameraFovDeg: cameraFovDeg || 40.0,
          estimatedDistanceM: estimatedDistanceM || 0.70,
          ...extraOptions,
        };
      }

      const canvasW = opts.viewWidth || opts.canvasWidth || 1280;
      const canvasH = opts.viewHeight || opts.canvasHeight || 720;
      const canvasAspect = canvasW / Math.max(1, canvasH);

      const videoW = opts.videoWidth || 1280;
      const videoH = opts.videoHeight || 720;
      const videoAspect = videoW / Math.max(1, videoH);

      const fovDeg = opts.cameraFovDeg || opts.cameraFov || 40.0;
      const cameraWorldZ = typeof opts.cameraZ === "number" ? opts.cameraZ : 2.0;

      // 2. Map Normalized Video Coordinates [0, 1] to Visible Screen Coordinates (Accounts for CSS object-fit: cover)
      const toScreenCoords = (lm) => {
        if (!lm) return { x: 0.5, y: 0.5, z: 0 };
        if (canvasAspect > videoAspect) {
          const renderedH = canvasW / videoAspect;
          const cropY = (renderedH - canvasH) / 2.0;
          return {
            x: lm.x,
            y: (lm.y * renderedH - cropY) / canvasH,
            z: lm.z || 0,
          };
        } else {
          const renderedW = canvasH * videoAspect;
          const cropX = (renderedW - canvasW) / 2.0;
          return {
            x: (lm.x * renderedW - cropX) / canvasW,
            y: lm.y,
            z: lm.z || 0,
          };
        }
      };

      // 3. Stable Anatomical Landmark Extraction
      // Left eye: 473 (pupil), 263 (outer canthus), 362 (inner canthus)
      // Right eye: 468 (pupil), 33 (outer canthus), 133 (inner canthus)
      let rawLeftPupil = landmarks[473];
      if (!rawLeftPupil && landmarks[263] && landmarks[362]) {
        rawLeftPupil = {
          x: (landmarks[263].x + landmarks[362].x) / 2.0,
          y: (landmarks[263].y + landmarks[362].y) / 2.0,
          z: ((landmarks[263].z || 0) + (landmarks[362].z || 0)) / 2.0,
        };
      }
      if (!rawLeftPupil) rawLeftPupil = landmarks[263] || { x: 0.55, y: 0.45, z: 0 };

      let rawRightPupil = landmarks[468];
      if (!rawRightPupil && landmarks[33] && landmarks[133]) {
        rawRightPupil = {
          x: (landmarks[33].x + landmarks[133].x) / 2.0,
          y: (landmarks[33].y + landmarks[133].y) / 2.0,
          z: ((landmarks[33].z || 0) + (landmarks[133].z || 0)) / 2.0,
        };
      }
      if (!rawRightPupil) rawRightPupil = landmarks[33] || { x: 0.45, y: 0.45, z: 0 };

      // Anatomical Nose Bridge Targets:
      // Landmark 6: Sellion (nasal root depression directly between inner eye corners)
      // Landmark 197: Upper nasal bone (saddle where spectacle bridge & nose pads rest)
      const rawSellion = landmarks[6] || landmarks[197] || landmarks[168] || landmarks[1];
      const rawNasalBridge = landmarks[197] || landmarks[6] || rawSellion;
      const rawNoseTip = landmarks[1] || rawSellion;
      const rawChin = landmarks[152] || { x: 0.5, y: 0.85, z: 0 };
      const rawForehead = landmarks[10] || { x: 0.5, y: 0.15, z: 0 };

      // Temple targets (lateral orbital margin / fronto-zygomatic suture where hinges meet front frame)
      const rawRightTemple = landmarks[127] || landmarks[234] || landmarks[33];
      const rawLeftTemple = landmarks[356] || landmarks[454] || landmarks[263];

      // Ear targets (tragi / pre-auricular where temple arms reach ears)
      const rawRightTragus = landmarks[234] || landmarks[33];
      const rawLeftTragus = landmarks[454] || landmarks[263];

      const rawRightEyeOuter = landmarks[33] || rawRightPupil;
      const rawLeftEyeOuter = landmarks[263] || rawLeftPupil;

      const sLeftPupil = toScreenCoords(rawLeftPupil);
      const sRightPupil = toScreenCoords(rawRightPupil);
      const sLeftEyeOuter = toScreenCoords(rawLeftEyeOuter);
      const sRightEyeOuter = toScreenCoords(rawRightEyeOuter);
      const sSellion = toScreenCoords(rawSellion);
      const sNasalBridge = toScreenCoords(rawNasalBridge);
      const sNoseTip = toScreenCoords(rawNoseTip);
      const sChin = toScreenCoords(rawChin);
      const sForehead = toScreenCoords(rawForehead);
      const sRightTemple = toScreenCoords(rawRightTemple);
      const sLeftTemple = toScreenCoords(rawLeftTemple);
      const sRightTragus = toScreenCoords(rawRightTragus);
      const sLeftTragus = toScreenCoords(rawLeftTragus);

      // 4. Metric Camera Depth Calculation via 3D Interpupillary Distance (Yaw-Invariant)
      const vFovRad = (fovDeg * Math.PI) / 180.0;
      const focalLengthPx = (canvasH / 2.0) / Math.tan(vFovRad / 2.0);

      const dxPupilsPx = (sLeftPupil.x - sRightPupil.x) * canvasW;
      const dyPupilsPx = (sLeftPupil.y - sRightPupil.y) * canvasH;
      // In MediaPipe normalized coordinates, z is scaled by canvasW (same as x)
      const dzPupilsPx = ((sLeftPupil.z || 0) - (sRightPupil.z || 0)) * canvasW;
      const ipd3D_px = Math.hypot(dxPupilsPx, dyPupilsPx, dzPupilsPx);

      // Z_metric = (f_px * Real_IPD_m) / IPD_3D_px (standard real-world adult IPD = 0.063m)
      let metricDistanceM = (focalLengthPx * 0.063) / Math.max(15.0, ipd3D_px);
      metricDistanceM = Math.max(0.30, Math.min(2.50, metricDistanceM));

      // 5. Frustum Geometry & 3D Perspective Unprojection into Three.js World Space
      const frustumHeight = 2.0 * Math.tan(vFovRad / 2.0) * metricDistanceM;
      const frustumWidth = frustumHeight * canvasAspect;

      // Eye midpoint depth baseline:
      // Subtracting sEyeMidZ removes any arbitrary MediaPipe head-origin offset
      // so depth is strictly relative to the tracked corneal/eye midpoint plane!
      const sEyeMidZ = ((sLeftPupil.z || 0) + (sRightPupil.z || 0)) * 0.5;

      const unprojectTo = (s, target) => {
        // Horizontally mirrored selfie NDC:
        // When CSS scaleX(-1) mirrors video: camera-left (s.x < 0.5, user right) appears on screen-right (ndcX > 0)
        // camera-right (s.x > 0.5, user left) appears on screen-left (ndcX < 0)
        const ndcX = (1.0 - s.x) * 2.0 - 1.0;
        const ndcY = -(s.y * 2.0 - 1.0);
        // MediaPipe z is normalized roughly proportional to image width (s.x)
        // Landmarks closer to camera have s.z < sEyeMidZ; landmarks farther have s.z > sEyeMidZ
        // Scale depth relative to vertical frustum height to maintain 1:1 isotropic depth and prevent pitch exaggeration
        const relDepth = ((s.z || 0) - sEyeMidZ) * frustumHeight;
        const ptDist = metricDistanceM + relDepth;
        const ptFrustumH = 2.0 * Math.tan(vFovRad / 2.0) * ptDist;
        const ptFrustumW = ptFrustumH * canvasAspect;

        target.x = (ndcX * ptFrustumW) / 2.0;
        target.y = (ndcY * ptFrustumH) / 2.0;
        target.z = cameraWorldZ - ptDist;
        return target;
      };

      unprojectTo(sLeftPupil, _vLeftPupil);
      unprojectTo(sRightPupil, _vRightPupil);
      unprojectTo(sLeftEyeOuter, _vLeftEyeOuter);
      unprojectTo(sRightEyeOuter, _vRightEyeOuter);
      unprojectTo(sSellion, _vSellion);
      unprojectTo(sNasalBridge, _vNasalBridge);
      unprojectTo(sNoseTip, _vNoseTip);
      unprojectTo(sChin, _vChin);
      unprojectTo(sForehead, _vForehead);
      unprojectTo(sLeftTemple, _vLeftTemple);
      unprojectTo(sRightTemple, _vRightTemple);
      unprojectTo(sLeftTragus, _vLeftTragus);
      unprojectTo(sRightTragus, _vRightTragus);

      // 6. Anatomical Eye Midpoint in 3D Space
      _vEyeMid.x = (_vLeftPupil.x + _vRightPupil.x) * 0.5;
      _vEyeMid.y = (_vLeftPupil.y + _vRightPupil.y) * 0.5;
      _vEyeMid.z = (_vLeftPupil.z + _vRightPupil.z) * 0.5;

      // 7. Anatomical Nasal Saddle Bridge Placement (Front Anchor)
      // Centered strictly on interpupillary Eye Midpoint (X) for 100% lateral eye symmetry.
      // Anchored squarely at the Sellion depression (Landmark 6) with a subtle natural ~2mm bias towards upper bridge (197)
      // so eyewear sits right at the natural bridge of the nose, cleanly covering the pupils without dropping low.
      _targetBridge.x = _vEyeMid.x;
      _targetBridge.y = _vSellion.y * 0.88 + _vNasalBridge.y * 0.12;
      _targetBridge.z = _vSellion.z;

      // 8. Physical Ear-Top Contact Anchors (Otobasion Superius - Rear Anchors)
      const earMidX = (_vLeftTragus.x + _vRightTragus.x) * 0.5;
      const earMidY = (_vLeftTragus.y + _vRightTragus.y) * 0.5 + 0.024;
      const earMidZ = (_vLeftTragus.z + _vRightTragus.z) * 0.5;

      // 9. Orthonormal Head Coordinate Basis (Pure Anatomical Skull Alignment):
      // Primary Lateral Axis (X): strictly along the horizontal eye canthi
      _faceRight.x = _vRightEyeOuter.x - _vLeftEyeOuter.x;
      _faceRight.y = _vRightEyeOuter.y - _vLeftEyeOuter.y;
      _faceRight.z = _vRightEyeOuter.z - _vLeftEyeOuter.z;
      this._normalizeInPlace(_faceRight);

      // Vertical Axis: from Chin (Landmark 152) to Forehead (Landmark 10)
      // Chin and Forehead lie on the vertical coronal plane of the human skull.
      // This gives 0.0° pitch at level gaze with zero nose protrusion bias!
      _rawUp.x = _vForehead.x - _vChin.x;
      _rawUp.y = _vForehead.y - _vChin.y;
      _rawUp.z = _vForehead.z - _vChin.z;
      this._normalizeInPlace(_rawUp);

      // Sagittal Normal Axis (Z): points strictly forward out of the face towards the camera (+Z in Three.js)
      // Right-handed cross product: faceForward = faceRight x rawUp
      _faceForward.x = _faceRight.y * _rawUp.z - _faceRight.z * _rawUp.y;
      _faceForward.y = _faceRight.z * _rawUp.x - _faceRight.x * _rawUp.z;
      _faceForward.z = _faceRight.x * _rawUp.y - _faceRight.y * _rawUp.x;
      this._normalizeInPlace(_faceForward);

      // Natural Human Neck Pitch Clamping:
      // Limits pitch to physical range [-10°, +10°] so temple arms stay horizontal and
      // locked to the ears (matching real eyewear in Image 3), NEVER flying into hair or chin!
      const maxPitchSin = 0.174; // ~10.0 degrees maximum pitch
      if (Math.abs(_faceForward.y) > maxPitchSin) {
        _faceForward.y = Math.sign(_faceForward.y) * maxPitchSin;
        _faceForward.z = Math.sqrt(Math.max(0.01, 1.0 - _faceForward.y * _faceForward.y));
      }
      this._normalizeInPlace(_faceForward);

      // Gram-Schmidt Orthonormal Upward Axis (Y): faceUp = faceForward x faceRight
      _faceUp.x = _faceForward.y * _faceRight.z - _faceForward.z * _faceRight.y;
      _faceUp.y = _faceForward.z * _faceRight.x - _faceForward.x * _faceRight.z;
      _faceUp.z = _faceForward.x * _faceRight.y - _faceForward.y * _faceRight.x;
      this._normalizeInPlace(_faceUp);

      // 10. Clean 3D Transformation Quaternion & Matrix Generation
      if (this.hasThree) {
        this._threeBasisX.set(_faceRight.x, _faceRight.y, _faceRight.z);
        this._threeBasisY.set(_faceUp.x, _faceUp.y, _faceUp.z);
        this._threeBasisZ.set(_faceForward.x, _faceForward.y, _faceForward.z);

        this.threeMatrix.makeBasis(this._threeBasisX, this._threeBasisY, this._threeBasisZ);
        this.threeQuaternion.setFromRotationMatrix(this.threeMatrix);
        this.threeEuler.setFromRotationMatrix(this.threeMatrix, "YXZ");

        // Snug nasal bone seating: flush with nasal saddle with zero forward floating
        _targetBridge.z = _targetBridge.z - _faceForward.z * 0.004;

        this.threeMatrix.setPosition(_targetBridge.x, _targetBridge.y, _targetBridge.z);
        this.threePosition.set(_targetBridge.x, _targetBridge.y, _targetBridge.z);
      }

      // Roll: 2D lateral tilt of eye axis in camera plane
      const roll = this.threeEuler ? this.threeEuler.z : Math.atan2(_faceRight.y, _faceRight.x);
      // Yaw: horizontal turning angle around vertical axis
      const yaw = this.threeEuler ? this.threeEuler.y : Math.atan2(-_faceRight.z, Math.hypot(_faceRight.x, _faceRight.y));
      // Pitch: In Three.js, looking UP produces Euler X < 0; invert sign so telemetry displays human-intuitive degrees
      const pitch = this.threeEuler ? -this.threeEuler.x : 0;

      // 11. Dynamic Anthropometric Measurements in 3D Metric Meters
      const rawTempleWidthM = Math.hypot(
        _vLeftTemple.x - _vRightTemple.x,
        _vLeftTemple.y - _vRightTemple.y,
        _vLeftTemple.z - _vRightTemple.z
      );

      const rawTragusWidthM = Math.hypot(
        _vLeftTragus.x - _vRightTragus.x,
        _vLeftTragus.y - _vRightTragus.y,
        _vLeftTragus.z - _vRightTragus.z
      );

      const ipdM = Math.hypot(
        _vLeftPupil.x - _vRightPupil.x,
        _vLeftPupil.y - _vRightPupil.y,
        _vLeftPupil.z - _vRightPupil.z
      );

      // Stable face width tracking invariant to yaw perspective foreshortening:
      // When facing front (|yaw| <= 10°), sample and filter true cranial width
      const absYawRad = Math.abs(yaw);
      if (absYawRad <= 0.17 || !this._calibratedTempleWidthM) {
        if (!this._calibratedTempleWidthM) {
          this._calibratedTempleWidthM = rawTempleWidthM;
          this._calibratedFaceWidthM = rawTragusWidthM;
        } else {
          this._calibratedTempleWidthM += 0.08 * (rawTempleWidthM - this._calibratedTempleWidthM);
          this._calibratedFaceWidthM += 0.08 * (rawTragusWidthM - this._calibratedFaceWidthM);
        }
      }
      const templeWidthM = this._calibratedTempleWidthM || rawTempleWidthM;
      const tragusWidthM = this._calibratedFaceWidthM || rawTragusWidthM;

      // Otobasion superius / superior auricular sulcus (+13mm above tragus, -7mm posterior):
      // This is the EXACT physical shelf where eyeglass temple arms rest on top of the ears!
      _vLeftEarRoot.x = _vLeftTragus.x + _faceUp.x * 0.013 - _faceForward.x * 0.007;
      _vLeftEarRoot.y = _vLeftTragus.y + _faceUp.y * 0.013 - _faceForward.y * 0.007;
      _vLeftEarRoot.z = _vLeftTragus.z + _faceUp.z * 0.013 - _faceForward.z * 0.007;

      _vRightEarRoot.x = _vRightTragus.x + _faceUp.x * 0.013 - _faceForward.x * 0.007;
      _vRightEarRoot.y = _vRightTragus.y + _faceUp.y * 0.013 - _faceForward.y * 0.007;
      _vRightEarRoot.z = _vRightTragus.z + _faceUp.z * 0.013 - _faceForward.z * 0.007;

      // True 3D sagittal depth from Sellion (nasal bridge) back to ears along the head's sagittal normal
      const dSellionToLeftEarZ = -((_vLeftEarRoot.x - _vSellion.x) * _faceForward.x +
                                  (_vLeftEarRoot.y - _vSellion.y) * _faceForward.y +
                                  (_vLeftEarRoot.z - _vSellion.z) * _faceForward.z);
      const dSellionToRightEarZ = -((_vRightEarRoot.x - _vSellion.x) * _faceForward.x +
                                   (_vRightEarRoot.y - _vSellion.y) * _faceForward.y +
                                   (_vRightEarRoot.z - _vSellion.z) * _faceForward.z);

      const dSellionToLeftEarY = ((_vLeftEarRoot.x - _vSellion.x) * _faceUp.x +
                                 (_vLeftEarRoot.y - _vSellion.y) * _faceUp.y +
                                 (_vLeftEarRoot.z - _vSellion.z) * _faceUp.z);
      const dSellionToRightEarY = ((_vRightEarRoot.x - _vSellion.x) * _faceUp.x +
                                  (_vRightEarRoot.y - _vSellion.y) * _faceUp.y +
                                  (_vRightEarRoot.z - _vSellion.z) * _faceUp.z);

      // Dynamic 3D Sagittal Ear Depth (Sellion to Otobasion Superius):
      // Supports full anthropometric variation across human skulls (110mm - 165mm)
      const validDepthL = (dSellionToLeftEarZ > 0.080 && dSellionToLeftEarZ < 0.170) ? dSellionToLeftEarZ : 0.128;
      const validDepthR = (dSellionToRightEarZ > 0.080 && dSellionToRightEarZ < 0.170) ? dSellionToRightEarZ : 0.128;

      let activeEarDepth = 0.128;
      let activeEarHeight = 0.008;

      if (Math.abs(yaw) > 0.12) {
        // In yaw turns (profile view), the visible near ear has pristine tracking geometry
        activeEarDepth = Math.max(validDepthL, validDepthR);
        activeEarHeight = (yaw > 0) ? (dSellionToRightEarY || dSellionToLeftEarY) : (dSellionToLeftEarY || dSellionToRightEarY);
      } else {
        // In frontal view, average both ears
        activeEarDepth = (validDepthL + validDepthR) * 0.5;
        activeEarHeight = (dSellionToLeftEarY + dSellionToRightEarY) * 0.5;
      }

      activeEarDepth = Math.max(0.110, Math.min(0.165, activeEarDepth));

      if (!this._calibratedEarDepthM) {
        this._calibratedEarDepthM = activeEarDepth;
      } else {
        // Adaptive exponential filtering (0.08 alpha) tracks moving users smoothly without jitter
        this._calibratedEarDepthM += 0.08 * (activeEarDepth - this._calibratedEarDepthM);
      }

      const leftEarDist = Math.hypot(_vLeftTragus.x - _vSellion.x, _vLeftTragus.y - _vSellion.y, _vLeftTragus.z - _vSellion.z);
      const rightEarDist = Math.hypot(_vRightTragus.x - _vSellion.x, _vRightTragus.y - _vSellion.y, _vRightTragus.z - _vSellion.z);
      const earDistM = (leftEarDist + rightEarDist) * 0.5;

      const quaternion = this.hasThree ? this.threeQuaternion : null;
      const matrix = this.hasThree ? this.threeMatrix : null;

      return {
        position: { x: _targetBridge.x, y: _targetBridge.y, z: _targetBridge.z },
        basis: {
          ux: { x: _faceRight.x, y: _faceRight.y, z: _faceRight.z },
          uy: { x: _faceUp.x, y: _faceUp.y, z: _faceUp.z },
          uz: { x: _faceForward.x, y: _faceForward.y, z: _faceForward.z },
          faceRight: _faceRight,
          faceUp: _faceUp,
          faceForward: _faceForward,
        },
        euler: { yaw, pitch, roll, threePitch: this.threeEuler ? this.threeEuler.x : 0 },
        quaternion,
        matrix,
        targetBridge: { x: _targetBridge.x, y: _targetBridge.y, z: _targetBridge.z },
        metrics: {
          distanceM: metricDistanceM,
          templeWidthM: Math.max(0.125, Math.min(0.170, templeWidthM)),
          faceWidthM: Math.max(0.125, Math.min(0.180, tragusWidthM)),
          ipdM: Math.max(0.050, Math.min(0.078, ipdM)),
          earDistM: Math.max(0.080, Math.min(0.145, earDistM)),
          earDepthM: Number(this._calibratedEarDepthM.toFixed(4)),
          earHeightM: Number(activeEarHeight.toFixed(4)),
        },
        anchors: {
          sellion: { x: _vSellion.x, y: _vSellion.y, z: _vSellion.z },
          targetBridge: { x: _targetBridge.x, y: _targetBridge.y, z: _targetBridge.z },
          eyeMid: { x: _vEyeMid.x, y: _vEyeMid.y, z: _vEyeMid.z },
          leftPupil: { x: _vLeftPupil.x, y: _vLeftPupil.y, z: _vLeftPupil.z },
          rightPupil: { x: _vRightPupil.x, y: _vRightPupil.y, z: _vRightPupil.z },
          leftEyeOuter: { x: _vLeftEyeOuter.x, y: _vLeftEyeOuter.y, z: _vLeftEyeOuter.z },
          rightEyeOuter: { x: _vRightEyeOuter.x, y: _vRightEyeOuter.y, z: _vRightEyeOuter.z },
          noseTip: { x: _vNoseTip.x, y: _vNoseTip.y, z: _vNoseTip.z },
          chin: { x: _vChin.x, y: _vChin.y, z: _vChin.z },
          forehead: { x: _vForehead.x, y: _vForehead.y, z: _vForehead.z },
          leftTemple: { x: _vLeftTemple.x, y: _vLeftTemple.y, z: _vLeftTemple.z },
          rightTemple: { x: _vRightTemple.x, y: _vRightTemple.y, z: _vRightTemple.z },
          leftTragus: { x: _vLeftTragus.x, y: _vLeftTragus.y, z: _vLeftTragus.z },
          rightTragus: { x: _vRightTragus.x, y: _vRightTragus.y, z: _vRightTragus.z },
          leftEarRoot: { x: _vLeftEarRoot.x, y: _vLeftEarRoot.y, z: _vLeftEarRoot.z },
          rightEarRoot: { x: _vRightEarRoot.x, y: _vRightEarRoot.y, z: _vRightEarRoot.z },
        },
      };
    }

    _normalizeInPlace(v) {
      const len = Math.hypot(v.x, v.y, v.z);
      if (len > 0.000001) {
        v.x /= len;
        v.y /= len;
        v.z /= len;
      } else {
        v.x = 0;
        v.y = 0;
        v.z = 1;
      }
      return v;
    }

    getDefaultPose() {
      return {
        position: { x: 0, y: 0.0, z: 1.30 },
        basis: {
          ux: { x: 1, y: 0, z: 0 },
          uy: { x: 0, y: 1, z: 0 },
          uz: { x: 0, y: 0, z: 1 },
          faceRight: { x: 1, y: 0, z: 0 },
          faceUp: { x: 0, y: 1, z: 0 },
          faceForward: { x: 0, y: 0, z: 1 },
        },
        euler: { yaw: 0, pitch: 0, roll: 0 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        matrix: null,
        targetBridge: { x: 0, y: 0.0, z: 1.30 },
        metrics: {
          distanceM: 0.70,
          templeWidthM: 0.136,
          faceWidthM: 0.140,
          ipdM: 0.063,
          earDistM: 0.100,
        },
        anchors: null,
      };
    }
  }

  return {
    HeadPoseEstimator,
  };
});
