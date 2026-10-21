/**
 * ============================================================================
 * VTO Pipeline: Temporal Smoothing Module (One Euro Filter)
 * ============================================================================
 * Casiez, Roussel, Vogel (CHI 2012): "1€ Filter: A Simple Speed-based
 * Low-pass Filter for Angular and Positional Jitter in Human-Computer Interaction"
 *
 * Implements adaptive cutoff frequency filtering:
 * - At low velocity (holding head still): Cutoff drops to minCutoff,
 *   aggressively eliminating micro-jitter from landmark noise.
 * - At high velocity (turning head): Cutoff expands dynamically proportional to
 *   velocity (beta * |v|), eliminating lag and maintaining 60FPS responsive tracking.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VTO = root.VTO || {};
    root.VTO.Filter = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Internal 1st-order Low-Pass Filter
   */
  class LowPassFilter {
    constructor(alpha, initVal = 0) {
      this.alpha = alpha;
      this.prev = initVal;
      this.initialized = false;
    }

    setAlpha(alpha) {
      this.alpha = Math.max(0, Math.min(1, alpha));
    }

    filter(val) {
      if (!this.initialized) {
        this.prev = val;
        this.initialized = true;
        return val;
      }
      const filtered = this.prev + this.alpha * (val - this.prev);
      this.prev = filtered;
      return filtered;
    }

    reset() {
      this.initialized = false;
      this.prev = 0;
    }
  }

  /**
   * Scalar One Euro Filter
   */
  class OneEuroFilter {
    /**
     * @param {number} minCutoff - Minimum cutoff frequency in Hz (typically 0.8 - 1.5 Hz)
     * @param {number} beta - Speed coefficient to reduce lag during quick motions (0.005 - 0.05)
     * @param {number} dCutoff - Cutoff frequency for derivative filtering (typically 1.0 Hz)
     */
    constructor(minCutoff = 1.0, beta = 0.015, dCutoff = 1.0) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;

      this.xFilter = new LowPassFilter(this._computeAlpha(minCutoff, 1 / 60));
      this.dxFilter = new LowPassFilter(this._computeAlpha(dCutoff, 1 / 60));
      this.lastTime = null;
      this.initialized = false;
    }

    _computeAlpha(cutoff, dt) {
      const tau = 1.0 / (2.0 * Math.PI * cutoff);
      return 1.0 / (1.0 + tau / dt);
    }

    filter(val, timestamp = performance.now()) {
      if (this.lastTime === null) {
        this.lastTime = timestamp;
        this.initialized = true;
        return this.xFilter.filter(val);
      }

      let dt = (timestamp - this.lastTime) / 1000.0;
      this.lastTime = timestamp;

      // Guard against non-monotonic or aberrant timestamps
      if (dt <= 0.0001) dt = 1.0 / 60.0;
      if (dt > 0.5) dt = 1.0 / 60.0;

      // 1. Estimate rate of change (derivative)
      const prevX = this.xFilter.prev;
      const dx = (val - prevX) / dt;

      // 2. Filter derivative
      this.dxFilter.setAlpha(this._computeAlpha(this.dCutoff, dt));
      const filteredDx = this.dxFilter.filter(dx);

      // 3. Compute dynamic cutoff based on speed
      const dynamicCutoff = this.minCutoff + this.beta * Math.abs(filteredDx);

      // 4. Filter value with dynamic cutoff
      this.xFilter.setAlpha(this._computeAlpha(dynamicCutoff, dt));
      return this.xFilter.filter(val);
    }

    reset() {
      this.xFilter.reset();
      this.dxFilter.reset();
      this.lastTime = null;
      this.initialized = false;
    }
  }

  /**
   * 3D Vector One Euro Filter (X, Y, Z coordinates or scale)
   */
  class Vector3Filter {
    constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
      this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
    }

    filter(vec, timestamp = performance.now()) {
      return {
        x: this.fx.filter(vec.x, timestamp),
        y: this.fy.filter(vec.y, timestamp),
        z: this.fz.filter(vec.z, timestamp),
      };
    }

    reset() {
      this.fx.reset();
      this.fy.reset();
      this.fz.reset();
    }
  }

  /**
   * Quaternion One Euro Filter for 3D Head Orientation
   * Preserves unit length and handles antipodal ambiguity (q == -q).
   */
  class QuaternionFilter {
    constructor(minCutoff = 0.8, beta = 0.03, dCutoff = 1.0) {
      this.fqx = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.fqy = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.fqz = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.fqw = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.prevQ = null;
    }

    filter(q, timestamp = performance.now()) {
      let qx = q.x, qy = q.y, qz = q.z, qw = q.w;

      // Handle antipodal symmetry: if dot product with previous quaternion < 0,
      // negate input quaternion to take shortest path on 4D hypersphere.
      if (this.prevQ) {
        const dot = qx * this.prevQ.x + qy * this.prevQ.y + qz * this.prevQ.z + qw * this.prevQ.w;
        if (dot < 0) {
          qx = -qx;
          qy = -qy;
          qz = -qz;
          qw = -qw;
        }
      }

      // Filter individual components
      let sx = this.fqx.filter(qx, timestamp);
      let sy = this.fqy.filter(qy, timestamp);
      let sz = this.fqz.filter(qz, timestamp);
      let sw = this.fqw.filter(qw, timestamp);

      // Re-normalize to ensure strictly valid rotation quaternion
      const len = Math.hypot(sx, sy, sz, sw);
      if (len > 0.00001) {
        sx /= len;
        sy /= len;
        sz /= len;
        sw /= len;
      } else {
        sx = 0; sy = 0; sz = 0; sw = 1;
      }

      this.prevQ = { x: sx, y: sy, z: sz, w: sw };
      return this.prevQ;
    }

    reset() {
      this.fqx.reset();
      this.fqy.reset();
      this.fqz.reset();
      this.fqw.reset();
      this.prevQ = null;
    }
  }

  /**
   * Circular Euler Angle Filter (Angles with phase unwrapping to prevent +/- 180° flips)
   */
  class EulerFilter {
    constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
      this.yawFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.pitchFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
      this.rollFilter = new OneEuroFilter(minCutoff, beta, dCutoff);

      this.prevYaw = 0;
      this.prevPitch = 0;
      this.prevRoll = 0;
      this.initialized = false;
    }

    _unwrap(angle, prevAngle) {
      let diff = angle - prevAngle;
      while (diff > Math.PI) {
        angle -= 2 * Math.PI;
        diff = angle - prevAngle;
      }
      while (diff < -Math.PI) {
        angle += 2 * Math.PI;
        diff = angle - prevAngle;
      }
      return angle;
    }

    filter(yaw, pitch, roll, timestamp = performance.now()) {
      if (!this.initialized) {
        this.prevYaw = yaw;
        this.prevPitch = pitch;
        this.prevRoll = roll;
        this.initialized = true;
      }

      const unwrappedYaw = this._unwrap(yaw, this.prevYaw);
      const unwrappedPitch = this._unwrap(pitch, this.prevPitch);
      const unwrappedRoll = this._unwrap(roll, this.prevRoll);

      const sYaw = this.yawFilter.filter(unwrappedYaw, timestamp);
      const sPitch = this.pitchFilter.filter(unwrappedPitch, timestamp);
      const sRoll = this.rollFilter.filter(unwrappedRoll, timestamp);

      this.prevYaw = sYaw;
      this.prevPitch = sPitch;
      this.prevRoll = sRoll;

      return { yaw: sYaw, pitch: sPitch, roll: sRoll };
    }

    reset() {
      this.yawFilter.reset();
      this.pitchFilter.reset();
      this.rollFilter.reset();
      this.initialized = false;
      this.prevYaw = 0;
      this.prevPitch = 0;
      this.prevRoll = 0;
    }
  }

  return {
    OneEuroFilter,
    Vector3Filter,
    QuaternionFilter,
    EulerFilter,
  };
});
