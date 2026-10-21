/**
 * ============================================================================
 * VTO Pipeline: Anthropometric Calibration & Metric Analysis Module
 * ============================================================================
 * Computes:
 * 1. Interpupillary Distance (IPD / PD) in pixels and millimeters
 * 2. Bizygomatic Face Width (cheekbone-to-cheekbone distance)
 * 3. Foreshortening compensation based on head yaw angle
 * 4. Pinhole camera metric distance estimation
 * 5. Dynamic scale factor for anatomical eyewear fitting
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VTO = root.VTO || {};
    root.VTO.Calibration = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Standard Human Anthropometric Baseline Constants (ISO 7250 / ANSI)
  const STANDARD_ADULT_IPD_MM = 63.0;        // Standard interpupillary distance: ~63mm
  const STANDARD_ADULT_FACE_WIDTH_MM = 140.0; // Standard bizygomatic width: ~140mm
  const STANDARD_GLASSES_WIDTH_MM = 140.0;   // Typical eyewear frame front width

  class AnthropometricCalibrator {
    constructor() {
      // Running smoothed statistics to avoid abrupt sizing jumps
      this.smoothedIPD_mm = STANDARD_ADULT_IPD_MM;
      this.smoothedFaceWidth_mm = STANDARD_ADULT_FACE_WIDTH_MM;
      this.smoothedDistance_m = 0.65; // ~65cm typical desktop/phone holding distance
      this.smoothedScaleFactor = 1.0;

      // Calibration status
      this.isCalibrated = false;
      this.frameCount = 0;
    }

    /**
     * Extracts precise 2D/3D eye centers (pupils) from MediaPipe landmarks
     * Supports both 478-point (with iris refinement) and standard 468-point meshes
     */
    extractPupils(landmarks, width, height) {
      let rightPupil, leftPupil;

      if (landmarks.length >= 478) {
        // Refined Iris Center landmarks
        // 468: Right iris center, 473: Left iris center
        rightPupil = {
          x: landmarks[468].x * width,
          y: landmarks[468].y * height,
          z: landmarks[468].z * width,
        };
        leftPupil = {
          x: landmarks[473].x * width,
          y: landmarks[473].y * height,
          z: landmarks[473].z * width,
        };
      } else {
        // Geometric palpebral fissure midpoint fallback:
        // Right eye: [33 (outer), 133 (inner), 159 (top), 145 (bottom)]
        const r33 = landmarks[33], r133 = landmarks[133], r159 = landmarks[159], r145 = landmarks[145];
        rightPupil = {
          x: ((r33.x + r133.x + r159.x + r145.x) / 4) * width,
          y: ((r33.y + r133.y + r159.y + r145.y) / 4) * height,
          z: ((r33.z + r133.z + r159.z + r145.z) / 4) * width,
        };

        // Left eye: [263 (outer), 362 (inner), 386 (top), 374 (bottom)]
        const l263 = landmarks[263], l362 = landmarks[362], l386 = landmarks[386], l374 = landmarks[374];
        leftPupil = {
          x: ((l263.x + l362.x + l386.x + l374.x) / 4) * width,
          y: ((l263.y + l362.y + l386.y + l374.y) / 4) * height,
          z: ((l263.z + l362.z + l386.z + l374.z) / 4) * width,
        };
      }

      return { rightPupil, leftPupil };
    }

    /**
     * Performs comprehensive anthropometric analysis for the current video frame
     *
     * @param {Array} landmarks - 468+ MediaPipe normalized face landmarks
     * @param {number} viewWidth - Viewport / video width in pixels
     * @param {number} viewHeight - Viewport / video height in pixels
     * @param {number} focalLengthPx - Camera focal length in pixels
     * @param {number} headYawRad - Current head yaw rotation in radians
     * @returns {Object} Metric measurement report
     */
    calibrate(landmarks, viewWidth, viewHeight, focalLengthPx, headYawRad = 0) {
      if (!landmarks || landmarks.length < 468) {
        return this.getDefaultMetrics();
      }

      // 1. Extract pupils and compute 2D Interpupillary Distance (IPD)
      const { rightPupil, leftPupil } = this.extractPupils(landmarks, viewWidth, viewHeight);
      const rawIPD_px = Math.hypot(leftPupil.x - rightPupil.x, leftPupil.y - rightPupil.y);

      // 2. Foreshortening Compensation:
      // When user rotates head left/right, the projected distance foreshortens as cos(yaw).
      // We compensate so distance and face size stay stable even during 45° profile turns.
      const cosYaw = Math.max(0.35, Math.abs(Math.cos(headYawRad)));
      const compensatedIPD_px = rawIPD_px / cosYaw;

      // 3. Bizygomatic Face Width (landmarks 234: right zygoma, 454: left zygoma)
      const lmRightZygoma = landmarks[234];
      const lmLeftZygoma = landmarks[454];
      const rightZygomaPx = { x: lmRightZygoma.x * viewWidth, y: lmRightZygoma.y * viewHeight };
      const leftZygomaPx = { x: lmLeftZygoma.x * viewWidth, y: lmLeftZygoma.y * viewHeight };
      const rawFaceWidth_px = Math.hypot(leftZygomaPx.x - rightZygomaPx.x, leftZygomaPx.y - rightZygomaPx.y);
      const compensatedFaceWidth_px = rawFaceWidth_px / cosYaw;

      // 4. Pinhole Camera Distance Estimation:
      // Z = (f * Real_IPD) / IPD_px
      // Using standard 63mm (0.063m) real physical IPD
      let estimatedDistance_m = (focalLengthPx * 0.063) / Math.max(10, compensatedIPD_px);
      estimatedDistance_m = Math.max(0.25, Math.min(2.5, estimatedDistance_m));

      // 5. Estimated Face Metrics in Millimeters:
      // Real_Width = (FaceWidth_px * Z) / f
      const estimatedFaceWidth_mm = (compensatedFaceWidth_px * estimatedDistance_m / focalLengthPx) * 1000.0;
      const estimatedIPD_mm = (compensatedIPD_px * estimatedDistance_m / focalLengthPx) * 1000.0;

      // 6. Anatomical Scale Factor:
      // Compares the user's face proportion to standard frame size
      // Narrow face (<132mm) -> Scale ~0.94
      // Average face (~140mm) -> Scale ~1.00
      // Broad face (>148mm) -> Scale ~1.06
      const faceScaleFactor = Math.max(0.85, Math.min(1.22, estimatedFaceWidth_mm / STANDARD_ADULT_FACE_WIDTH_MM));

      // Temporal smoothing of calibration metrics (Alpha blending)
      const alpha = 0.08;
      this.smoothedIPD_mm = this.smoothedIPD_mm * (1 - alpha) + estimatedIPD_mm * alpha;
      this.smoothedFaceWidth_mm = this.smoothedFaceWidth_mm * (1 - alpha) + estimatedFaceWidth_mm * alpha;
      this.smoothedDistance_m = this.smoothedDistance_m * (1 - alpha) + estimatedDistance_m * alpha;
      this.smoothedScaleFactor = this.smoothedScaleFactor * (1 - alpha) + faceScaleFactor * alpha;

      this.frameCount++;
      if (this.frameCount > 15) this.isCalibrated = true;

      // Classify Face Width Category
      let faceType = "Regular Fit (Medium)";
      if (this.smoothedFaceWidth_mm < 132) faceType = "Narrow Fit (Small)";
      else if (this.smoothedFaceWidth_mm > 146) faceType = "Wide Fit (Large)";

      return {
        // Pixel domain
        rawIPD_px,
        compensatedIPD_px,
        rawFaceWidth_px,
        compensatedFaceWidth_px,

        // Metric real-world domain
        estimatedDistance_m: this.smoothedDistance_m,
        ipd_mm: Number(this.smoothedIPD_mm.toFixed(1)),
        faceWidth_mm: Number(this.smoothedFaceWidth_mm.toFixed(1)),
        faceType,
        scaleFactor: this.smoothedScaleFactor,

        // Landmark positions in pixels
        pupils: {
          left: leftPupil,
          right: rightPupil,
        },
        zygoma: {
          left: leftZygomaPx,
          right: rightZygomaPx,
        },
      };
    }

    getDefaultMetrics() {
      return {
        rawIPD_px: 60,
        compensatedIPD_px: 60,
        rawFaceWidth_px: 130,
        compensatedFaceWidth_px: 130,
        estimatedDistance_m: 0.65,
        ipd_mm: STANDARD_ADULT_IPD_MM,
        faceWidth_mm: STANDARD_ADULT_FACE_WIDTH_MM,
        faceType: "Regular Fit (Medium)",
        scaleFactor: 1.0,
      };
    }

    reset() {
      this.smoothedIPD_mm = STANDARD_ADULT_IPD_MM;
      this.smoothedFaceWidth_mm = STANDARD_ADULT_FACE_WIDTH_MM;
      this.smoothedDistance_m = 0.65;
      this.smoothedScaleFactor = 1.0;
      this.isCalibrated = false;
      this.frameCount = 0;
    }
  }

  return {
    AnthropometricCalibrator,
    STANDARD_ADULT_IPD_MM,
    STANDARD_ADULT_FACE_WIDTH_MM,
    STANDARD_GLASSES_WIDTH_MM,
  };
});
