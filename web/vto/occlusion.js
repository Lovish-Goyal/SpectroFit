/**
 * ============================================================================
 * VTO Pipeline: 3D Anatomical Head & Face Occlusion Module
 * ============================================================================
 * Creates an invisible 3D head occluder mesh that writes strictly to the WebGL
 * depth buffer (colorWrite: false, depthWrite: true, renderOrder: 0).
 *
 * Realism Benefit:
 * When the user turns their head at 45° or 90° profile views:
 * - The far temple arm of the glasses naturally disappears behind the ear and head contour.
 * - Nose pads tuck realistically against the nasal slopes.
 * - Prevents the immersion-breaking artifact of glasses floating through human skulls.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VTO = root.VTO || {};
    root.VTO.Occlusion = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  class HeadOcclusionMesh {
    constructor() {
      this.group = null;
      this.occluderMesh = null;
      this.debugWireframe = null;
      this.isDebugVisible = false;
      this.isEnabled = true;

      this.material = null;
      this.debugMaterial = null;

      if (typeof THREE !== "undefined") {
        this._initMesh();
      }
    }

    setEnabled(enabled) {
      this.isEnabled = !!enabled;
      if (this.occluderMesh) {
        this.occluderMesh.visible = this.isEnabled;
      }
    }

    _initMesh() {
      this.group = new THREE.Group();
      this.group.name = "vto-head-occluder-group";

      // 1. Invisible Depth-Only Occluder Material
      // Writes to Z-buffer so subsequent render calls (glasses) perform depth test
      // against this invisible surface and are properly clipped!
      this.material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        colorWrite: false, // Transparent to RGBA color buffer
        depthWrite: true,  // Writes to WebGL depth buffer
        depthTest: true,
      });

      // 2. Debug Material for Visual Inspection (Semi-transparent cyan wireframe)
      this.debugMaterial = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });

      // 3. Build Anatomical Head Occluder Geometry
      // Modeled relative to the Sellion (nasal root origin at [0, 0, 0])
      const headGeom = this._createHeadGeometry();

      this.occluderMesh = new THREE.Mesh(headGeom, this.material);
      this.occluderMesh.name = "depth-occluder-mesh";
      this.occluderMesh.renderOrder = 0; // MUST render prior to glasses (renderOrder: 1)
      this.group.add(this.occluderMesh);

      this.debugWireframe = new THREE.Mesh(headGeom, this.debugMaterial);
      this.debugWireframe.name = "debug-wireframe-mesh";
      this.debugWireframe.visible = false;
      this.group.add(this.debugWireframe);
    }

    /**
     * Builds an anatomically proportioned head, temporal flank, facial mask, forehead dome, and ear occluder geometry
     * Origin [0, 0, 0] is centered at the Sellion (nasal bridge seating anchor)
     */
    _createHeadGeometry() {
      // Anatomical Head, Facial Mask, Forehead Dome, Temporal Flank, and Ear Depth Occluders:
      // Origin [0, 0, 0] is centered at the Sellion (nasal root skin anchor)
      // Front surface sits strictly behind the orbital rim (Z <= -0.010m)
      // Guarantees:
      // 1. Front lenses and frames (Z >= 0) are NEVER occluded at any angle.
      // 2. In frontal view (pitch ~7°), the facial mask occludes rear temple tips from showing inside the lenses.
      // 3. In downward pitch (pitch ~21°), the forehead dome occludes rear temple tips from showing over the forehead/hair.
      // 4. In 3/4 and side views (yaw 30°-60°), lateral temporal clearance (> 5mm) ensures near temple is 100% visible.

      // 1. Full Facial Ocular & Cheek Shield:
      // Width: 96mm (half-width 48mm). Provides 26mm lateral clearance ensuring straight temple arms
      // (running at X >= 74mm) are 100% visible from front face without any clipping!
      const faceMaskGeo = new THREE.BoxGeometry(0.096, 0.120, 0.070);
      faceMaskGeo.translate(0, -0.015, -0.050);

      // 2. Forehead & Upper Cranial Vault Dome:
      // Half-width 48mm: leaves lateral temple corridor open during downward head pitch
      const foreheadGeo = new THREE.SphereGeometry(0.048, 32, 24);
      foreheadGeo.scale(1.0, 1.20, 1.15);
      foreheadGeo.translate(0, 0.050, -0.090);

      // 3. Cranial Core (Central neurocranium & temporal bone):
      // Half-width 48mm: safely occludes the far-side temple arm in profile/yaw turns, while
      // allowing temple arms on both sides (at X >= 74mm) to remain 100% visible in frontal gaze!
      const skullGeo = new THREE.SphereGeometry(0.048, 32, 24);
      skullGeo.scale(1.0, 1.20, 1.20);
      skullGeo.translate(0, 0.005, -0.115);

      // 4. Bilateral Ear Pinna Depth Occluders:
      // Sits strictly behind the ear shelf (Z <= -0.158m, Y <= -0.020m)
      // Allows straight temple arm resting on top of the ears to remain 100% visible, while
      // clipping ONLY the downward hook that dips behind the ear cartilage!
      const leftEarGeo = new THREE.BoxGeometry(0.024, 0.045, 0.035);
      leftEarGeo.translate(-0.078, -0.042, -0.175);

      const rightEarGeo = new THREE.BoxGeometry(0.024, 0.045, 0.035);
      rightEarGeo.translate(0.078, -0.042, -0.175);

      const allGeometries = [faceMaskGeo, foreheadGeo, skullGeo, leftEarGeo, rightEarGeo];

      // Merge into single optimized BufferGeometry
      if (typeof THREE.BufferGeometryUtils !== "undefined" && THREE.BufferGeometryUtils.mergeBufferGeometries) {
        return THREE.BufferGeometryUtils.mergeBufferGeometries(allGeometries);
      }

      // Standalone merge fallback without requiring BufferGeometryUtils
      return this._mergeGeometries(allGeometries);
    }

    _mergeGeometries(geometries) {
      let totalPos = 0;
      let totalNorm = 0;
      let totalIdx = 0;

      geometries.forEach((g) => {
        totalPos += g.attributes.position.array.length;
        if (g.attributes.normal) totalNorm += g.attributes.normal.array.length;
        if (g.index) totalIdx += g.index.array.length;
      });

      const mergedPos = new Float32Array(totalPos);
      const mergedNorm = new Float32Array(totalNorm);
      const mergedIdx = totalIdx > 0 ? new Uint32Array(totalIdx) : null;

      let posOffset = 0;
      let normOffset = 0;
      let idxOffset = 0;
      let vertexOffset = 0;

      geometries.forEach((g) => {
        mergedPos.set(g.attributes.position.array, posOffset);
        posOffset += g.attributes.position.array.length;

        if (g.attributes.normal) {
          mergedNorm.set(g.attributes.normal.array, normOffset);
          normOffset += g.attributes.normal.array.length;
        }

        if (g.index && mergedIdx) {
          for (let i = 0; i < g.index.array.length; i++) {
            mergedIdx[idxOffset + i] = g.index.array[i] + vertexOffset;
          }
          idxOffset += g.index.array.length;
        }

        vertexOffset += g.attributes.position.count;
      });

      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
      if (totalNorm > 0) {
        merged.setAttribute("normal", new THREE.BufferAttribute(mergedNorm, 3));
      } else {
        merged.computeVertexNormals();
      }
      if (mergedIdx) {
        merged.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
      }

      return merged;
    }

    /**
     * Updates occluder transform in lockstep with the head pose
     */
    updateTransform(position, rotation, scale = 1.0) {
      if (!this.group) return;

      this.group.position.set(position.x, position.y, position.z);

      if (rotation.isQuaternion) {
        this.group.quaternion.copy(rotation);
      } else {
        this.group.rotation.set(rotation.x, rotation.y, rotation.z);
      }

      if (scale && typeof scale.x === "number") {
        this.group.scale.set(scale.x, scale.y, scale.z);
      } else {
        this.group.scale.set(scale, scale, scale);
      }
    }

    /**
     * Toggles semi-transparent debug wireframe for visual diagnostics
     */
    setDebugMode(enabled) {
      this.isDebugVisible = !!enabled;
      if (this.debugWireframe) {
        this.debugWireframe.visible = this.isDebugVisible;
      }
    }

    getMesh() {
      return this.group;
    }

    dispose() {
      if (this.occluderMesh) {
        this.occluderMesh.geometry.dispose();
        this.material.dispose();
      }
      if (this.debugWireframe) {
        this.debugWireframe.geometry.dispose();
        this.debugMaterial.dispose();
      }
    }
  }

  return {
    HeadOcclusionMesh,
  };
});
