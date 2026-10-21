/**
 * ============================================================================
 * VTO Pipeline: Real-Time Face Tracking Module (MediaPipe FaceMesh 468+)
 * ============================================================================
 * Handles:
 * 1. WebRTC camera feed acquisition (front-facing camera)
 * 2. MediaPipe FaceMesh initialization with dense 468+ iris-refined landmarks
 * 3. High-throughput video frame processing (30-60 FPS)
 * 4. Tracking health telemetry and confidence monitoring
 * 5. Autonomous synthetic trajectory fallback for headless or restricted testing
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VTO = root.VTO || {};
    root.VTO.FaceTracker = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  class FaceTracker {
    constructor(videoElement) {
      this.videoElement = videoElement;
      this.faceMesh = null;
      this.mediaStream = null;

      this.isRunning = false;
      this.isProcessingFrame = false;
      this.isSimulated = false;

      // Event listeners
      this.onLandmarksCallback = null;
      this.onStatusCallback = null;

      // Telemetry & Profiling
      this.fps = 0;
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this.trackingConfidence = 0;
      this.lastInferenceMs = 0;

      // Autonomous tracking scheduler state
      this._trackingLoopActive = false;
      this._trackingTimer = null;
      this._videoCallbackId = null;
      this._lastTrackTimestamp = 0;

      // Pre-allocated persistent landmarks buffer for simulated mode (zero per-frame allocations)
      this._simLandmarks = new Array(478);
      for (let i = 0; i < 478; i++) {
        this._simLandmarks[i] = { x: 0.5, y: 0.5, z: 0 };
      }
    }

    /**
     * Initializes MediaPipe FaceMesh model from CDN with resilient retry polling
     */
    async init() {
      if (typeof FaceMesh === "undefined") {
        console.warn("[FaceTracker] MediaPipe FaceMesh CDN script not yet loaded, polling...");
        let retries = 0;
        while (typeof FaceMesh === "undefined" && retries < 20) {
          await new Promise((r) => setTimeout(r, 200));
          retries++;
        }
        if (typeof FaceMesh === "undefined") {
          console.warn("[FaceTracker] MediaPipe FaceMesh CDN unavailable. Simulated AR ready as fallback.");
          return false;
        }
      }

      try {
        this.faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true, // Enables 478 landmarks (468 facial + 10 iris)
          minDetectionConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        this.faceMesh.onResults((results) => this._handleResults(results));
        console.log("[FaceTracker] MediaPipe FaceMesh initialized successfully (468+ points).");
        return true;
      } catch (err) {
        console.error("[FaceTracker] Failed to initialize FaceMesh:", err);
        return false;
      }
    }

    /**
     * Starts live webcam stream and autonomous tracking loop
     */
    async startCamera() {
      this.isSimulated = false;

      if (!this.videoElement) {
        throw new Error("No video element provided to FaceTracker.");
      }

      if (!this.faceMesh) {
        await this.init();
      }

      try {
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
        } catch (constraintErr) {
          console.warn("[FaceTracker] Optimal camera constraints failed, attempting fallback constraints:", constraintErr);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user" },
              audio: false,
            });
          } catch (facingErr) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        this.mediaStream = stream;
        this.videoElement.srcObject = stream;
        this.videoElement.style.background = "transparent";
        this.videoElement.style.display = "block";
        await this.videoElement.play();
        this.isRunning = true;

        if (this.onStatusCallback) {
          this.onStatusCallback({ status: "CAMERA_ACTIVE", isSimulated: false });
        }

        // Start autonomous rate-limited tracking scheduler (independent of 60 FPS Three.js render loop)
        this.startTrackingLoop();
        return true;
      } catch (err) {
        console.warn("[FaceTracker] Camera access denied or hardware unavailable. Activating simulated AR:", err);
        this.startSimulatedMode();
        return false;
      }
    }

    /**
     * Autonomous tracking scheduler
     * Decouples neural face inference (24-30 FPS) from Three.js rendering (60 FPS).
     * Incorporates backpressure: if inference is in-flight, skips frames ("latest result wins").
     */
    startTrackingLoop() {
      if (this._trackingLoopActive) return;
      this._trackingLoopActive = true;

      const trackTick = async () => {
        if (!this._trackingLoopActive || !this.isRunning) {
          this._trackingLoopActive = false;
          return;
        }

        const now = performance.now();

        if (!this.isProcessingFrame) {
          if (this.isSimulated) {
            this.updateSimulated(now);
          } else if (this.videoElement && this.videoElement.readyState >= 2 && this.faceMesh) {
            this._lastTrackTimestamp = now;
            await this.processFrame();
          }
        }

        if (this._trackingLoopActive && this.isRunning) {
          // Schedule next tick via requestVideoFrameCallback if supported by camera video, else requestAnimationFrame
          if (this.videoElement && typeof this.videoElement.requestVideoFrameCallback === "function" && !this.isSimulated) {
            this._videoCallbackId = this.videoElement.requestVideoFrameCallback(() => {
              trackTick();
            });
          } else {
            this._trackingTimer = requestAnimationFrame(trackTick);
          }
        }
      };

      trackTick();
    }

    stopTrackingLoop() {
      this._trackingLoopActive = false;
      if (this._trackingTimer) {
        cancelAnimationFrame(this._trackingTimer);
        clearTimeout(this._trackingTimer);
        this._trackingTimer = null;
      }
      if (this._videoCallbackId && this.videoElement && typeof this.videoElement.cancelVideoFrameCallback === "function") {
        this.videoElement.cancelVideoFrameCallback(this._videoCallbackId);
        this._videoCallbackId = null;
      }
    }

    /**
     * Sends current video frame to FaceMesh for inference with telemetry instrumentation
     */
    async processFrame() {
      if (!this.isRunning || this.isSimulated) return;

      if (
        this.videoElement &&
        this.videoElement.readyState >= 2 &&
        this.faceMesh &&
        !this.isProcessingFrame
      ) {
        this.isProcessingFrame = true;
        const t0 = performance.now();
        try {
          await this.faceMesh.send({ image: this.videoElement });
          const dt = performance.now() - t0;
          this.lastInferenceMs = Number(dt.toFixed(1));
          if (typeof window !== "undefined" && window._vtoProfile) {
            window._vtoProfile.inferenceMs = this.lastInferenceMs;
            if (window._vtoProfile.history && window._vtoProfile.history.inferenceTimes) {
              window._vtoProfile.history.inferenceTimes.push(dt);
              if (window._vtoProfile.history.inferenceTimes.length > 60) {
                window._vtoProfile.history.inferenceTimes.shift();
              }
            }
          }
        } catch (err) {
          // Swallow intermittent pipeline frame drop
        } finally {
          this.isProcessingFrame = false;
        }
      }
    }

    _handleResults(results) {
      // Calculate tracking FPS
      const now = performance.now();
      this.frameCount++;
      if (now - this.lastFrameTime >= 1000) {
        this.fps = Number(((this.frameCount * 1000) / (now - this.lastFrameTime)).toFixed(1));
        this.frameCount = 0;
        this.lastFrameTime = now;
        if (typeof window !== "undefined" && window._vtoProfile) {
          window._vtoProfile.trackingFPS = this.fps;
        }
      }

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        this.trackingConfidence = 0.98;

        const videoW = this.videoElement ? this.videoElement.videoWidth || 1280 : 1280;
        const videoH = this.videoElement ? this.videoElement.videoHeight || 720 : 720;

        if (this.onLandmarksCallback) {
          this.onLandmarksCallback(landmarks, videoW, videoH, now);
        }
      } else {
        this.trackingConfidence = 0;
        if (this.onLandmarksCallback) {
          this.onLandmarksCallback(null, 0, 0, now);
        }
      }
    }

    /**
     * Simulated AR fallback generating smooth multi-view 468-point head trajectories
     */
    startSimulatedMode() {
      this.stopCamera();
      this.isSimulated = true;
      this.isRunning = true;
      this._lastTrackTimestamp = 0;

      if (this.videoElement) {
        this.videoElement.style.display = "block";
        this.videoElement.style.background = "#09090b";
      }

      if (this.onStatusCallback) {
        this.onStatusCallback({ status: "SIMULATED_ACTIVE", isSimulated: true });
      }

      // Start autonomous tracking loop for simulated mode at controlled rate
      this.startTrackingLoop();
    }

    /**
     * Updates simulated face trajectory using persistent landmarks buffer (zero per-frame allocations)
     */
    updateSimulated(timestamp = performance.now()) {
      if (!this.isSimulated || !this.onLandmarksCallback) return;

      const now = performance.now();
      this.frameCount++;
      if (now - this.lastFrameTime >= 1000) {
        this.fps = Number(((this.frameCount * 1000) / (now - this.lastFrameTime)).toFixed(1));
        this.frameCount = 0;
        this.lastFrameTime = now;
        if (typeof window !== "undefined" && window._vtoProfile) {
          window._vtoProfile.trackingFPS = this.fps;
        }
      }

      const t = timestamp * 0.001;

      // Realistic human head motion curve:
      // Yaw oscillates +/- 28° (smooth left-right inspection) or adheres to manual test angle
      // Pitch oscillates +/- 12° (natural nodding) or adheres to manual test angle
      const yawAngle = (typeof this.simYaw === "number") ? this.simYaw : Math.sin(t * 0.8) * 0.45;
      const pitchAngle = (typeof this.simPitch === "number") ? this.simPitch : Math.cos(t * 1.1) * 0.18;
      const rollAngle = (typeof this.simRoll === "number") ? this.simRoll : Math.sin(t * 0.5) * 0.06;

      const centerX = 0.50 + Math.sin(t * 0.4) * 0.02;
      const centerY = 0.48 + Math.cos(t * 0.6) * 0.015;

      const halfEyeSpan = 0.038;
      const halfFaceSpan = 0.075;

      const setProjected = (idx, localX, localY, localZ) => {
        // Yaw (around Y)
        const x1 = localX * Math.cos(yawAngle) + localZ * Math.sin(yawAngle);
        const z1 = -localX * Math.sin(yawAngle) + localZ * Math.cos(yawAngle);

        // Pitch (around X)
        const y2 = localY * Math.cos(pitchAngle) - z1 * Math.sin(pitchAngle);
        const z2 = -(localY * Math.sin(pitchAngle)) + z1 * Math.cos(pitchAngle);

        // Roll (around Z)
        const x3 = x1 * Math.cos(rollAngle) - y2 * Math.sin(rollAngle);
        const y3 = x1 * Math.sin(rollAngle) + y2 * Math.cos(rollAngle);

        const pt = this._simLandmarks[idx];
        pt.x = centerX + x3;
        pt.y = centerY + y3;
        pt.z = -z2;
      };

      // 1. Core Anatomical Anchors:
      setProjected(168, 0, -0.015, 0.012);        // Sellion / Nose bridge
      setProjected(6,   0, -0.005, 0.015);        // Mid-bridge
      setProjected(197, 0, -0.010, 0.014);        // Upper bridge
      setProjected(195, 0, 0.005, 0.022);         // Lower bridge
      setProjected(5,   0, 0.015, 0.028);         // Infranasale
      setProjected(4,   0, 0.020, 0.032);         // Supratip
      setProjected(1,   0, 0.025, 0.035);         // Pronasale / Nose tip
      setProjected(19,  0, 0.030, 0.030);         // Columella
      setProjected(94,  0, 0.035, 0.024);         // Subnasale
      setProjected(2,   0, 0.040, 0.020);         // Philtrum top
      setProjected(164, 0, 0.050, 0.018);         // Philtrum
      setProjected(0,   0, 0.058, 0.016);         // Upper lip center
      setProjected(13,  0, 0.066, 0.014);         // Stomion / Lip opening
      setProjected(14,  0, 0.072, 0.013);         // Lower lip center
      setProjected(17,  0, 0.082, 0.012);         // Labiomental sulcus
      setProjected(152, 0, 0.125, 0.010);         // Gnathion / Chin
      setProjected(10,  0, -0.145, -0.010);       // Glabella / Forehead
      setProjected(151, 0, -0.110, -0.002);
      setProjected(9,   0, -0.080, 0.005);
      setProjected(8,   0, -0.045, 0.008);

      // 2. Eyes & Pupils
      setProjected(33,  -halfEyeSpan, -0.015, 0); // Right eye outer canthus
      setProjected(133, -0.015, -0.015, 0.005);   // Right eye inner canthus
      setProjected(263, halfEyeSpan, -0.015, 0);  // Left eye outer canthus
      setProjected(362, 0.015, -0.015, 0.005);    // Left eye inner canthus
      setProjected(468, -halfEyeSpan * 0.7, -0.015, 0.002); // Right Pupil
      setProjected(473, halfEyeSpan * 0.7, -0.015, 0.002);  // Left Pupil

      // Iris rings
      const irisR = 0.0045;
      const rIrisIdx = [468, 469, 470, 471, 472];
      const lIrisIdx = [473, 474, 475, 476, 477];
      for (let k = 0; k < 5; k++) {
        const ang = (k / 4) * Math.PI * 2;
        setProjected(rIrisIdx[k], -halfEyeSpan * 0.7 + Math.cos(ang) * irisR, -0.015 + Math.sin(ang) * irisR, 0.002);
        setProjected(lIrisIdx[k], halfEyeSpan * 0.7 + Math.cos(ang) * irisR, -0.015 + Math.sin(ang) * irisR, 0.002);
      }

      // Eye contour loops
      const rEyeRing = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
      const lEyeRing = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
      for (let k = 0; k < rEyeRing.length; k++) {
        const ang = (k / rEyeRing.length) * Math.PI * 2;
        const ex = Math.cos(ang) * 0.012;
        const ey = Math.sin(ang) * 0.0065;
        setProjected(rEyeRing[k], -halfEyeSpan * 0.7 + ex, -0.015 + ey, 0.003 * Math.cos(ang));
        setProjected(lEyeRing[k], halfEyeSpan * 0.7 + ex, -0.015 + ey, 0.003 * Math.cos(ang));
      }

      // 3. Eyebrows
      const rBrowIdx = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
      const lBrowIdx = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
      for (let k = 0; k < rBrowIdx.length; k++) {
        const frac = k / (rBrowIdx.length - 1);
        const bx = -0.014 - frac * 0.032;
        const by = -0.030 - Math.sin(frac * Math.PI) * 0.008;
        setProjected(rBrowIdx[k], bx, by, 0.004);
        setProjected(lBrowIdx[k], -bx, by, 0.004);
      }

      // 4. Skull Oval / Jawline (36 points)
      const ovalIdx = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
        379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
        234, 127, 162, 21, 54, 103, 67, 109
      ];
      for (let k = 0; k < ovalIdx.length; k++) {
        const ang = (k / ovalIdx.length) * Math.PI * 2 - Math.PI / 2;
        const ox = Math.cos(ang) * halfFaceSpan;
        const oy = -0.010 + Math.sin(ang) * 0.135;
        const oz = -0.045 * Math.abs(Math.sin(ang));
        setProjected(ovalIdx[k], ox, oy, oz);
      }

      // 5. Tragi / Temples
      setProjected(234, -halfFaceSpan, 0.01, -0.045); // Right zygoma / tragus
      setProjected(454, halfFaceSpan, 0.01, -0.045);  // Left zygoma / tragus
      setProjected(127, -halfFaceSpan * 0.88, -0.012, -0.015); // Right temple
      setProjected(356, halfFaceSpan * 0.88, -0.012, -0.015);  // Left temple

      // 6. Lips (Outer & Inner)
      const lipsOuterIdx = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
      const lipsInnerIdx = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
      for (let k = 0; k < lipsOuterIdx.length; k++) {
        const ang = (k / lipsOuterIdx.length) * Math.PI * 2;
        const lx = Math.cos(ang) * 0.022;
        const ly = 0.068 + Math.sin(ang) * 0.012;
        setProjected(lipsOuterIdx[k], lx, ly, 0.015);
      }
      for (let k = 0; k < lipsInnerIdx.length; k++) {
        const ang = (k / lipsInnerIdx.length) * Math.PI * 2;
        const lx = Math.cos(ang) * 0.015;
        const ly = 0.068 + Math.sin(ang) * 0.006;
        setProjected(lipsInnerIdx[k], lx, ly, 0.013);
      }

      // 7. Populate remaining facial points with anatomical cranial offsets
      const assigned = new Set([
        168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 13, 14, 17, 152, 10, 151, 9, 8,
        33, 133, 263, 362, 468, 473, 234, 454, 127, 356,
        ...rIrisIdx, ...lIrisIdx, ...rEyeRing, ...lEyeRing,
        ...rBrowIdx, ...lBrowIdx, ...ovalIdx, ...lipsOuterIdx, ...lipsInnerIdx
      ]);

      const refPt = this._simLandmarks[168];
      for (let i = 0; i < 478; i++) {
        if (!assigned.has(i)) {
          // Spread smoothly over the facial surface based on index pseudo-hash
          const pseudoAngle = (i * 0.173) % (Math.PI * 2);
          const pseudoRadius = 0.015 + ((i * 37) % 100) * 0.00045;
          const px = Math.cos(pseudoAngle) * pseudoRadius * (halfFaceSpan / 0.06);
          const py = -0.010 + Math.sin(pseudoAngle) * pseudoRadius * 1.5;
          const pz = 0.012 - (pseudoRadius / 0.06) * 0.025;
          setProjected(i, px, py, pz);
        }
      }

      this.onLandmarksCallback(this._simLandmarks, 1280, 720, timestamp);
    }

    stopCamera() {
      this.isRunning = false;
      this.isSimulated = false;
      this.stopTrackingLoop();

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
    }
  }

  return {
    FaceTracker,
  };
});
