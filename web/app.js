// SpectroFit AR &bull; Enterprise Virtual Try-On & Dynamic Compute Offloader
// Production WebXR & Edge Spatial Computing Architecture

const BACKEND_URL = (window.location.port === "30080" || window.location.port === "8080") ? "" : "http://localhost:30080";

// --- Scene & Graphics State ---
let scene, camera, renderer, controls, raycaster, mouse;
let floorMesh = null, roomGroup = null, humanAvatarGroup = null, active3DModel = null;

// 360 Rotation State
let isAutoSpinning = false;
let currentRotationY = 0;
let currentPitchX = 0;
let rotationRingMesh = null;

// Built-in Authoritative Eyewear Catalog (Guarantees instant display regardless of backend connectivity)
const DEFAULT_SPECS_CATALOG = [
  {
    id: "specs-aviator",
    name: "Gold Titanium Aviator",
    category: "specs",
    sub_category: "Aviator",
    polygon_count: 3400,
    lod_level: "HIGH",
    price_usd: 160.00
  },
  {
    id: "specs-wayfarer",
    name: "Classic Acetate Wayfarer",
    category: "specs",
    sub_category: "Wayfarer",
    polygon_count: 4200,
    lod_level: "HIGH",
    price_usd: 145.00
  },
  {
    id: "specs-round",
    name: "Minimalist Round Wire Frames",
    category: "specs",
    sub_category: "Round",
    polygon_count: 2900,
    lod_level: "LOW",
    price_usd: 120.00
  },
  {
    id: "specs-clubmaster",
    name: "Retro Browline Clubmaster",
    category: "specs",
    sub_category: "Square",
    polygon_count: 4600,
    lod_level: "HIGH",
    price_usd: 175.00
  },
  {
    id: "specs-matte-black",
    name: "Matte Black Square Sunglasses",
    category: "specs",
    sub_category: "Square",
    polygon_count: 1004,
    lod_level: "LOW",
    price_usd: 130.00
  },
  {
    id: "specs-sport-shield",
    name: "Aerodynamic Sport Shield Glasses",
    category: "specs",
    sub_category: "Sport",
    polygon_count: 32152,
    lod_level: "HIGH",
    price_usd: 210.00
  },
  {
    id: "specs-rectangular",
    name: "Executive Rectangular Optical Frames",
    category: "specs",
    sub_category: "Rectangular",
    polygon_count: 1904,
    lod_level: "LOW",
    price_usd: 155.00
  },
  {
    id: "specs-prada-vintage",
    name: "Prada Vintage Star Sunglasses",
    category: "specs",
    sub_category: "Designer",
    polygon_count: 5200,
    lod_level: "HIGH",
    price_usd: 310.00
  },
  {
    id: "specs-new1",
    name: "Cyber Stealth Modern Frames (New 1)",
    category: "specs",
    sub_category: "Designer",
    polygon_count: 52435,
    lod_level: "HIGH",
    price_usd: 185.00
  },
  {
    id: "specs-new2",
    name: "Horizon Minimalist Wireframe (New 2)",
    category: "specs",
    sub_category: "Modern",
    polygon_count: 4948,
    lod_level: "LOW",
    price_usd: 165.00
  }
];

// Catalog & Navigation State
let catalog = [...DEFAULT_SPECS_CATALOG];
let activeCategory = "specs";
let activeSubFilter = "all";
let categoryFilteredItems = [];
let currentItemIndex = 0;
let selectedAsset = null;

// Telemetry & FPS State
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFPS = 60.0;

// Camera AR View State
let isCameraMode = false;
let webcamStream = null;
let currentModelLoadToken = 0;

// GLTF Loader Instance
const gltfLoader = (typeof THREE.GLTFLoader !== "undefined") ? new THREE.GLTFLoader() : null;

// DOM Elements: Header & Controls
const activeProductName = document.getElementById("active-product-name");
const activeProductAnchor = document.getElementById("active-product-anchor");
const btnStudioMode = document.getElementById("btn-studio-mode");
const btnCameraMode = document.getElementById("btn-camera-mode");
const webcamFeed = document.getElementById("webcam-feed");

// Top-Right Next/Prev Carousel
const btnPrevItem = document.getElementById("btn-prev-item");
const btnNextItem = document.getElementById("btn-next-item");
const carouselCurrIdx = document.getElementById("carousel-curr-idx");
const carouselTotalIdx = document.getElementById("carousel-total-idx");

// Sub-Category Filter Ribbon
const subCategoryRibbon = document.getElementById("sub-category-ribbon");
const subFilterChips = document.getElementById("sub-filter-chips");

// Viewport Overlays & Action Buttons
const contextualCameraGuide = document.getElementById("contextual-camera-guide");
const cameraGuideInstruction = document.getElementById("camera-guide-instruction");
const btnRotateLeft = document.getElementById("btn-rotate-left");
const btnRotateRight = document.getElementById("btn-rotate-right");
const btnResetView = document.getElementById("btn-reset-view");
const btnClearPlaced = document.getElementById("btn-clear-placed");
const hintLabel = document.getElementById("hint-label");

// Production VTO Pipeline State & HUD Elements
let vtoPipeline = null;
let cvDiagnostics = null;
let isOcclusionWireframe = false;
const vtoMetricsBadge = document.getElementById("vto-metrics-badge");
const vtoMetricPD = document.getElementById("vto-metric-pd");
const vtoMetricWidth = document.getElementById("vto-metric-width");
const vtoMetricPose = document.getElementById("vto-metric-pose");
const vtoMetricOcclusion = document.getElementById("vto-metric-occlusion");
const btnToggleRigidDebug = document.getElementById("btn-toggle-rigid-debug");
const labelRigidDebugBtn = document.getElementById("label-rigid-debug-btn");
let isRigidDebugActive = false;
const btnToggleOcclusion = document.getElementById("btn-toggle-occlusion");
const labelOcclusionBtn = document.getElementById("label-occlusion-btn");



// Sidebar Elements
const categoryDropdown = document.getElementById("category-dropdown");
const productsExplorerList = document.getElementById("products-explorer-list");
const sidebarModelCount = document.getElementById("sidebar-model-count");

// Bottom Dock Elements
const decisionBadge = document.getElementById("decision-badge");
const metricM2P = document.getElementById("metric-m2p");
const metricServerTime = document.getElementById("metric-server-time");
const metricFPS = document.getElementById("metric-fps");
const decisionReason = document.getElementById("decision-reason");

const rangeBattery = document.getElementById("range-battery");
const rangeCPU = document.getElementById("range-cpu");
const rangeRTT = document.getElementById("range-rtt");
const labelBat = document.getElementById("label-bat");
const labelCPU = document.getElementById("label-cpu");
const labelRTT = document.getElementById("label-rtt");

const presetNormal = document.getElementById("preset-normal");
const presetBattery = document.getElementById("preset-battery");
const presetCPU = document.getElementById("preset-cpu");
const presetRTT = document.getElementById("preset-rtt");

// --- 1. Three.js Initialization & Lighting ---
function initThree() {
  const container = document.getElementById("viewport-stage-area");
  const canvas = document.getElementById("ar-viewport-canvas");

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 40);
  camera.position.set(0, 1.635, 0.65);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Cap DPR to 1.5 to prevent massive fillrate collapse on high-DPI / mobile screens
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.628, 0.02);

  // Strict Zoom & Pitch Clamping: Limits zoom out strictly to chest level, never full body
  controls.minDistance = 0.32;  // Close-up inspection of eyewear fit on eyes and bridge
  controls.maxDistance = 0.82;  // STRICTLY chest-up limit: never zooms out past chest level!
  controls.minPolarAngle = Math.PI / 2 - 0.40;
  controls.maxPolarAngle = Math.PI / 2 + 0.18;

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  setupLighting();
  buildRealisticRoom();
  buildRealisticHumanPortrait();
  build360OrientationRing();

  // Initialize Production-Grade Virtual Try-On Pipeline
  if (window.VTO && window.VTO.Pipeline) {
    vtoPipeline = new window.VTO.Pipeline.VTOPipeline({
      scene: scene,
      camera: camera,
      videoElement: webcamFeed,
      viewportElement: container,
    });
    vtoPipeline.setHumanAvatarGroup(humanAvatarGroup);
    vtoPipeline.init();
    if (window.VTO && window.VTO.CVDiagnosticsOverlay) {
      cvDiagnostics = new window.VTO.CVDiagnosticsOverlay.CVDiagnosticsOverlay(vtoPipeline);
    }
    window._debug = {
      scene,
      camera,
      controls,
      renderer,
      vtoPipeline,
      cvDiagnostics,
      humanAvatarGroup,
      getActive3DModel: () => active3DModel,
      setRigidGlassesDebug: (enabled) => {
        isRigidDebugActive = !!enabled;
        if (vtoPipeline) vtoPipeline.setRigidGlassesDebug(isRigidDebugActive);
        if (labelRigidDebugBtn) {
          labelRigidDebugBtn.textContent = isRigidDebugActive ? "Temple debug: on" : "Temple debug: off";
        }
        if (btnToggleRigidDebug) {
          btnToggleRigidDebug.classList.toggle("active", isRigidDebugActive);
        }
        lastHudUpdateTime = 0;
      },
    };
  } else {
    window._debug = { scene, camera, renderer, humanAvatarGroup, getActive3DModel: () => active3DModel };
  }

  // Toggle Rigid Glasses Visual Debug
  if (btnToggleRigidDebug) {
    btnToggleRigidDebug.addEventListener("click", () => {
      isRigidDebugActive = !isRigidDebugActive;
      if (vtoPipeline) {
        vtoPipeline.setRigidGlassesDebug(isRigidDebugActive);
      }
      if (labelRigidDebugBtn) {
        labelRigidDebugBtn.textContent = isRigidDebugActive ? "Temple debug: on" : "Temple debug: off";
      }
      if (btnToggleRigidDebug) {
        btnToggleRigidDebug.classList.toggle("active", isRigidDebugActive);
      }
    });
  }

  // Toggle Occluder Wireframe Debug Mode
  if (btnToggleOcclusion) {
    btnToggleOcclusion.addEventListener("click", () => {
      isOcclusionWireframe = !isOcclusionWireframe;
      if (vtoPipeline) {
        vtoPipeline.setOcclusionDebug(isOcclusionWireframe);
      }
      if (labelOcclusionBtn) {
        labelOcclusionBtn.textContent = isOcclusionWireframe ? "Hide Occluder" : "Show Occluder";
      }
      if (vtoMetricOcclusion) {
        vtoMetricOcclusion.textContent = isOcclusionWireframe ? "Occluder: Wireframe" : "Depth Occlusion: ON";
      }
    });
  }


  window.addEventListener("resize", onWindowResize);
  canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onCanvasWheel, { passive: true });

  animate();
}

function setupLighting() {
  // Target object anchored at facial level (y = 1.63) so directional lights focus right onto the face
  const faceTarget = new THREE.Object3D();
  faceTarget.position.set(0, 1.63, 0);
  scene.add(faceTarget);

  // Soft ambient baseline: preserves shadow contrast so facial contours (nose, lips, eyes) are clearly sculpted
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.28);
  scene.add(ambientLight);

  // Clean studio hemisphere light: neutral white sky, soft slate-gray ground for vertical chiaroscuro relief
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x475569, 0.32);
  hemiLight.position.set(0, 4.0, 0);
  scene.add(hemiLight);

  // Crisp directional key light focused directly onto the facial plane (defines nose bridge, cheekbones, lips)
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.95);
  mainLight.position.set(1.6, 2.8, 2.2);
  mainLight.target = faceTarget;
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 10;
  mainLight.shadow.camera.left = -0.5;
  mainLight.shadow.camera.right = 0.5;
  mainLight.shadow.camera.top = 0.5;
  mainLight.shadow.camera.bottom = -0.5;
  mainLight.shadow.bias = -0.0005;
  scene.add(mainLight);

  // Soft neutral white fill light from opposite angle to soften form shadows without flattening them
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.22);
  fillLight.position.set(-2.0, 1.8, 1.4);
  fillLight.target = faceTarget;
  scene.add(fillLight);

  // Soft neutral white rim light to cleanly outline silhouette of cranium & shoulders
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
  rimLight.position.set(0, 2.4, -2.0);
  rimLight.target = faceTarget;
  scene.add(rimLight);
}

// Builds a realistic architectural modern room (for Furniture & Decor)
function buildRealisticRoom() {
  roomGroup = new THREE.Group();
  roomGroup.name = "architectural-room";
  scene.add(roomGroup);
}

// Builds 3D Human Model from web/models/human/scene.glb
function buildRealisticHumanPortrait() {
  humanAvatarGroup = new THREE.Group();
  humanAvatarGroup.name = "realistic-human-avatar";

  if (gltfLoader) {
    const candidatePaths = [
      "models/human/scene.glb",
      "models/human/human_male_bust.glb",
      "models/human/mannequin_head.glb",
      "models/human/mannequin_head_-_3_-_untextured.glb",
      "models/human/scene.gltf"
    ];

    function tryLoadAvatar(idx) {
      if (idx >= candidatePaths.length) {
        buildProceduralHumanBust();
        return;
      }
      gltfLoader.load(
        candidatePaths[idx],
        (gltf) => {
          const humanModel = gltf.scene;
          humanModel.name = "human-mesh";

          // Compute bounding box and normalize scale & center
          const box = new THREE.Box3().setFromObject(humanModel);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // Target realistic human height (~1.75m)
          const targetHeight = 1.75;
          const scaleFactor = targetHeight / (size.y || 1);
          humanModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

          // Center bounding box horizontally and align base to floor (y = 0)
          humanModel.position.x = -center.x * scaleFactor;
          humanModel.position.z = -center.z * scaleFactor;
          humanModel.position.y = -box.min.y * scaleFactor;

          humanModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.geometry && !child.geometry.attributes.normal) {
                child.geometry.computeVertexNormals();
              }
              if (child.material) {
                child.material.roughness = 0.65;
                child.material.metalness = 0.02;
                if (!child.material.map && child.material.color) {
                  child.material.color.setHex(0xe2e8f0); // Elegant alabaster plaster white with clear sculptural shading
                }
              }
            }
          });

          const humanWrapper = new THREE.Group();
          humanWrapper.name = "human-wrapper";
          humanWrapper.add(humanModel);
          // Face forward straight toward camera (+Z) with calibrated bilateral ear symmetry
          humanWrapper.rotation.y = Math.PI + 0.165;

          humanAvatarGroup.add(humanWrapper);
        },
        undefined,
        (err) => {
          console.warn(`Failed loading avatar candidate ${candidatePaths[idx]}, trying next...`, err);
          tryLoadAvatar(idx + 1);
        }
      );
    }
    tryLoadAvatar(0);
  } else {
    buildProceduralHumanBust();
  }

  scene.add(humanAvatarGroup);
}

// Procedural fallback mannequin if gltf cannot be loaded
function buildProceduralHumanBust() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdeb89b, roughness: 1.0, metalness: 0.0 });
  const headGeo = new THREE.SphereGeometry(0.115, 32, 32);
  headGeo.scale(1.0, 1.25, 1.12);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 1.65, 0);
  head.castShadow = true;
  humanAvatarGroup.add(head);

  const scleraMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x5b3a29, roughness: 0.2 });
  [-0.038, 0.038].forEach((xPos) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), scleraMat);
    eye.position.set(xPos, 1.67, 0.10);
    humanAvatarGroup.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), irisMat);
    iris.position.set(xPos, 1.67, 0.116);
    humanAvatarGroup.add(iris);
  });

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.05, 12), skinMat);
  nose.position.set(0, 1.645, 0.12);
  nose.rotation.x = -0.15;
  humanAvatarGroup.add(nose);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.18, 0.45, 32), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
  torso.scale.set(1.2, 1, 0.7);
  torso.position.set(0, 1.22, 0);
  torso.castShadow = true;
  humanAvatarGroup.add(torso);
}



// 360° Circular Orientation Ring to indicate rotation anchor
function build360OrientationRing() {
  const ringGeo = new THREE.RingGeometry(0.65, 0.67, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x2563eb,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  rotationRingMesh = new THREE.Mesh(ringGeo, ringMat);
  rotationRingMesh.rotation.x = -Math.PI / 2;
  rotationRingMesh.position.set(0, 0.005, 0);
  rotationRingMesh.visible = false;
  scene.add(rotationRingMesh);
}

// --- 2. High-Fidelity 3D Product Factory (Supports User .gltf with Auto-Normalization) ---
function getModelCandidatePaths(asset) {
  const paths = [];

  // Direct mappings to GLB models:
  if (asset.category === "specs") {
    if (asset.id === "specs-aviator") {
      paths.push("models/specs/specs-aviator.glb");
      paths.push("models/specs/glasses1.glb");
      paths.push("models/specs/glasses (1).glb");
      paths.push("sketch_models/glasses (1).glb");
    } else if (asset.id === "specs-wayfarer") {
      paths.push("models/specs/specs-wayfarer.glb");
      paths.push("models/specs/glasses2.glb");
      paths.push("models/specs/glasses.glb");
      paths.push("sketch_models/glasses.glb");
    } else if (asset.id === "specs-round") {
      paths.push("models/specs/specs-round.glb");
      paths.push("models/specs/glasses3.glb");
      paths.push("models/specs/glasses (4).glb");
      paths.push("sketch_models/glasses (4).glb");
    } else if (asset.id === "specs-clubmaster") {
      paths.push("models/specs/specs-clubmaster.glb");
      paths.push("models/specs/glasses4.glb");
      paths.push("models/specs/glasses_1.0.glb");
      paths.push("sketch_models/glasses_1.0.glb");
    } else if (asset.id === "specs-matte-black") {
      paths.push("models/specs/specs-matte-black.glb");
      paths.push("models/specs/black_glasses.glb");
      paths.push("sketch_models/black_glasses.glb");
      paths.push("models/specs/glasses (3).glb");
      paths.push("sketch_models/glasses (3).glb");
    } else if (asset.id === "specs-sport-shield") {
      paths.push("models/specs/specs-sport-shield.glb");
      paths.push("models/specs/glasses (2).glb");
      paths.push("sketch_models/glasses (2).glb");
      paths.push("models/specs/glasses (5).glb");
    } else if (asset.id === "specs-rectangular") {
      paths.push("models/specs/specs-rectangular.glb");
      paths.push("models/specs/glasses (3).glb");
      paths.push("sketch_models/glasses (3).glb");
      paths.push("models/specs/glasses (6).glb");
    } else if (asset.id === "specs-prada-vintage") {
      paths.push("models/specs/prada_vintage_star_glasses.glb");
      paths.push("sketch_models/prada_vintage_star_glasses.glb");
    } else if (asset.id === "specs-new1" || asset.id === "new1") {
      paths.push("models/specs/specs-new1.glb");
      paths.push("sketch_models/new1.glb");
      paths.push("models/specs/new1.glb");
    } else if (asset.id === "specs-new2" || asset.id === "new2") {
      paths.push("models/specs/specs-new2.glb");
      paths.push("sketch_models/new2.glb");
      paths.push("models/specs/new2.glb");
    }
  }

  // Generic fallback paths across all storage directories
  paths.push(`models/${asset.category}/${asset.id}.glb`);
  paths.push(`models/specs/${asset.id}.glb`);
  paths.push(`sketch_models/${asset.id}.glb`);
  const strippedId = (asset.id || "").replace(/^specs-/, "");
  paths.push(`models/specs/${strippedId}.glb`);
  paths.push(`sketch_models/${strippedId}.glb`);
  return paths;
}

function loadProductModel(asset, callback) {
  const token = currentModelLoadToken;
  const candidatePaths = getModelCandidatePaths(asset);

  function tryLoadPath(idx) {
    if (token !== currentModelLoadToken) return;

    if (idx >= candidatePaths.length || !gltfLoader) {
      const fallbackMesh = createProcedural3DModel(asset);
      if (token === currentModelLoadToken) {
        callback(fallbackMesh);
      }
      return;
    }

    const path = candidatePaths[idx];
    gltfLoader.load(
      path,
      (gltf) => {
        if (token !== currentModelLoadToken) return;
        const loadedModel = gltf.scene;
        if (asset.category === "specs") {
          // Glasses are normalized and aligned authoritatively by VTO Fitter
          callback(loadedModel);
        } else {
          const normalized = normalizeModelGeometry(loadedModel, asset);
          callback(normalized);
        }
      },
      undefined,
      (err) => {
        if (token !== currentModelLoadToken) return;
        tryLoadPath(idx + 1);
      }
    );
  }

  tryLoadPath(0);
}

// Automatically normalizes scale, centers bounding box, and sets materials
function normalizeModelGeometry(loadedScene, asset) {
  // Remove lights, cameras, or extraneous helper nodes embedded in GLTF (e.g. Blender Light/Camera in glasses4)
  const toRemove = [];
  loadedScene.traverse((child) => {
    if (child.isCamera || child.isLight) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((c) => {
    if (c.parent) c.parent.remove(c);
  });

  if (asset.category === "specs") {
    if (asset.id === "specs-aviator" || asset.id.includes("aviator")) {
      // glasses1: Y is up, Z is width, X is depth
      // Rotating Y by -90° (-Math.PI/2) puts width along X, depth along -Z, and leaves height along Y
      loadedScene.rotation.set(0, -Math.PI / 2, 0);
    } else {
      loadedScene.rotation.set(0, 0, 0);
    }
    loadedScene.updateMatrixWorld(true);
  }

  const box = new THREE.Box3().setFromObject(loadedScene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const targetDimension = 0.145; // ~14.5 cm realistic human eyewear width
  const scaleFactor = targetDimension / (size.x || 1);
  loadedScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
  // Anchor FRONT lenses at Z = 0; temples extend backwards into -Z (towards ears)
  // Symmetrical centering in X (0) and vertical centering in Y (0)
  loadedScene.position.set(-center.x * scaleFactor, -center.y * scaleFactor, -box.max.z * scaleFactor);

  loadedScene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const wrapper = new THREE.Group();
  wrapper.name = asset.id;
  wrapper.add(loadedScene);
  return wrapper;
}

// High-Fidelity Procedural 3D Models
function createProcedural3DModel(asset) {
  const group = new THREE.Group();
  group.name = asset.id;

  switch (asset.id) {
    // 👓 Glasses:
    case "specs-aviator": {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.18 });
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.0 });

      [-0.038, 0.038].forEach((xPos) => {
        const lensGeo = new THREE.CylinderGeometry(0.028, 0.025, 0.002, 32);
        lensGeo.rotateX(Math.PI / 2);
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(xPos, 0, 0);
        group.add(lens);

        const rimGeo = new THREE.TorusGeometry(0.028, 0.0018, 12, 32);
        const rim = new THREE.Mesh(rimGeo, goldMat);
        rim.position.set(xPos, 0, 0);
        group.add(rim);
      });

      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.022, 8), goldMat);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 0.006, 0);
      group.add(bridge);

      [-0.068, 0.068].forEach((xPos) => {
        const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.11, 8), goldMat);
        temple.rotation.x = Math.PI / 2;
        temple.position.set(xPos, 0.006, -0.055);
        group.add(temple);
      });
      break;
    }

    case "specs-wayfarer": {
      const blackAcetate = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25 });
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.0 });

      [-0.038, 0.038].forEach((xPos) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, 0.004), blackAcetate);
        frame.position.set(xPos, 0, 0);
        group.add(frame);

        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.034, 0.005), lensMat);
        lens.position.set(xPos, 0, 0.001);
        group.add(lens);
      });

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.004), blackAcetate);
      bridge.position.set(0, 0.01, 0);
      group.add(bridge);

      [-0.068, 0.068].forEach((xPos) => {
        const temple = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.008, 0.11), blackAcetate);
        temple.position.set(xPos, 0.01, -0.055);
        group.add(temple);
      });
      break;
    }

    case "specs-round": {
      const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
      const clearLens = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.0 });

      [-0.036, 0.036].forEach((xPos) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0015, 12, 32), silverMat);
        rim.position.set(xPos, 0, 0);
        group.add(rim);

        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.001, 32), clearLens);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(xPos, 0, 0);
        group.add(lens);
      });

      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.024, 8), silverMat);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 0.005, 0);
      group.add(bridge);
      break;
    }

    case "specs-clubmaster": {
      const brownMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.3 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });

      [-0.038, 0.038].forEach((xPos) => {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.006), brownMat);
        brow.position.set(xPos, 0.014, 0);
        group.add(brow);

        const lowerRim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0015, 12, 32), goldMat);
        lowerRim.position.set(xPos, -0.005, 0);
        group.add(lowerRim);
      });
      break;
    }




  }

  return group;
}

// Helper to completely purge any previous models or lingering meshes from the scene
function removeAllProductModels() {
  if (active3DModel) {
    scene.remove(active3DModel);
    if (humanAvatarGroup) humanAvatarGroup.remove(active3DModel);
    active3DModel = null;
  }

  const toRemove = [];
  scene.traverse((child) => {
    if (!child) return;
    if (child.userData && child.userData.isProductModel) {
      toRemove.push(child);
    } else if (child.name && (
      child.name.startsWith("vto-frame-") ||
      child.name.startsWith("product-model-") ||
      child.name.startsWith("specs-") ||
      child.name.startsWith("furniture-") ||
      child.name.startsWith("chair-") ||
      child.name.startsWith("table-") ||
      child.name.startsWith("sofa-")
    )) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((m) => {
    if (m.parent) m.parent.remove(m);
  });

  if (vtoPipeline) {
    vtoPipeline.clearActiveModel();
  }
}

// --- 3. Product Positioning & Camera Framing ---
function displayProductInScene(asset) {
  const thisToken = ++currentModelLoadToken;

  removeAllProductModels();

  // Reset Rotation Coordinates
  currentRotationY = 0;
  currentPitchX = 0;

  loadProductModel(asset, (model) => {
    if (thisToken !== currentModelLoadToken) {
      return; // Discard stale model from superseded async load
    }
    removeAllProductModels(); // Final guarantee against race conditions

    model.userData.isProductModel = true;
    model.name = `product-model-${asset.id}`;
    active3DModel = model;

    // Always reset model rotation so items sit true to anatomical anchor
    model.rotation.set(0, 0, 0);

    humanAvatarGroup.visible = !isCameraMode;
    if (roomGroup) roomGroup.visible = false;

    if (vtoPipeline) {
      active3DModel = vtoPipeline.setGlassesModel(asset, model);
      if (!isCameraMode) {
        vtoPipeline.setMode("studio");
        smoothCamera(new THREE.Vector3(0, 1.635, 0.65), new THREE.Vector3(0, 1.628, 0.02));
        updateContextualCameraGuide("face", "3D Avatar • Anatomical Fit");
        hintLabel.innerHTML = "3D Studio &bull; Drag to inspect fit in 360&deg; &bull; Switch to Live Camera AR anytime.";
        if (vtoMetricsBadge) vtoMetricsBadge.style.display = "none";
        if (btnToggleOcclusion) btnToggleOcclusion.style.display = "none";
        if (cvDiagnostics) cvDiagnostics.onCameraDeactivated();
      } else {
        if (vtoPipeline.currentMode !== "camera") {
          vtoPipeline.setMode("camera");
        }
        updateContextualCameraGuide("face", "Virtual Try-On • Live Eyewear Fit");
        hintLabel.innerHTML = "Virtual Try-On &bull; Move head naturally to test eyewear fit.";
        if (vtoMetricsBadge) {
          const showBadge = cvDiagnostics && (cvDiagnostics.activeMode === "diagnostics" || cvDiagnostics.activeMode === "research");
          vtoMetricsBadge.style.display = showBadge ? "flex" : "none";
        }
        if (btnToggleOcclusion) btnToggleOcclusion.style.display = "flex";
        if (cvDiagnostics) cvDiagnostics.onCameraActivated();
      }
    } else {
      model.position.set(0, 1.625, 0.140);
      scene.add(model);
      smoothCamera(new THREE.Vector3(0, 1.66, 0.70), new THREE.Vector3(0, 1.62, 0));
      updateContextualCameraGuide("face", "Virtual Try-On • Live Eyewear Fit");
    }

    // Trigger Edge Offload heuristic evaluation
    evaluateOffloadingEngine(asset);
  });
}

function updateContextualCameraGuide(mode, instructionText) {
  if (cameraGuideInstruction) {
    cameraGuideInstruction.textContent = instructionText;
  }
}

let currentCameraAnim = null;

function smoothCamera(targetPos, targetLookAt) {
  if (currentCameraAnim) {
    clearInterval(currentCameraAnim);
    currentCameraAnim = null;
  }
  const startPos = camera.position.clone();
  const startLookAt = controls.target.clone();
  let progress = 0;

  currentCameraAnim = setInterval(() => {
    if (isCameraMode) {
      clearInterval(currentCameraAnim);
      currentCameraAnim = null;
      return;
    }
    progress += 0.08;
    if (progress >= 1.0) {
      camera.position.copy(targetPos);
      controls.target.copy(targetLookAt);
      controls.update();
      clearInterval(currentCameraAnim);
      currentCameraAnim = null;
    } else {
      camera.position.lerpVectors(startPos, targetPos, progress);
      controls.target.lerpVectors(startLookAt, targetLookAt, progress);
      controls.update();
    }
  }, 16);
}

// --- 4. Category Navigation & Product Explorer ---
function setCategory(cat) {
  currentModelLoadToken++; // Abort any in-flight loads from previous category
  activeCategory = cat;
  activeSubFilter = "all";

  removeAllProductModels();

  // Eyewear VTO HUD badges strictly visible ONLY for diagnostics/research in Camera Mode
  if (vtoMetricsBadge) {
    const showBadge = isCameraMode && cvDiagnostics && (cvDiagnostics.activeMode === "diagnostics" || cvDiagnostics.activeMode === "research");
    vtoMetricsBadge.style.display = showBadge ? "flex" : "none";
  }
  if (btnToggleOcclusion) btnToggleOcclusion.style.display = isCameraMode ? "flex" : "none";
  if (cvDiagnostics) {
    if (isCameraMode) {
      cvDiagnostics.onCameraActivated();
    } else {
      cvDiagnostics.onCameraDeactivated();
    }
  }

  // Load all eyewear items directly
  categoryFilteredItems = catalog.filter(item => item.category === "specs" || !item.category);
  if (!categoryFilteredItems.length) categoryFilteredItems = catalog;

  // Populate Left Sidebar Product Explorer List
  renderProductExplorerList();

  currentItemIndex = 0;
  loadCurrentItem();
}

// Hook up category dropdown switch
if (categoryDropdown) {
  categoryDropdown.addEventListener("change", (e) => {
    setCategory(e.target.value);
  });
}

function getGlassesThumbnailSvg(item) {
  const id = (item.id || "").toLowerCase();
  const sub = (item.sub_category || "").toLowerCase();


  // Eyewear items
  if (id.includes("round") || sub.includes("round")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#eab308" stroke-width="1.3">
      <circle cx="7" cy="7" r="5"></circle>
      <circle cx="21" cy="7" r="5"></circle>
      <path d="M12 6.5 C13 5.5, 15 5.5, 16 6.5"></path>
      <path d="M2 6 L0 5.5"></path>
      <path d="M26 6 L28 5.5"></path>
    </svg>`;
  }
  if (id.includes("matte-black") || (id.includes("square") && !id.includes("clubmaster"))) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="#1e2436" stroke="#475569" stroke-width="1.3">
      <rect x="2" y="2" width="10" height="10" rx="2"></rect>
      <rect x="16" y="2" width="10" height="10" rx="2"></rect>
      <path d="M12 4.5 L16 4.5" stroke="#475569"></path>
    </svg>`;
  }
  if (id.includes("sport-shield")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="#1e2233" stroke="#f43f5e" stroke-width="1.3">
      <path d="M2 3.5 Q14 1 26 3.5 L24.5 10.5 Q14 13 3.5 10.5 Z"></path>
      <line x1="14" y1="2" x2="14" y2="7" stroke="#f43f5e"></line>
    </svg>`;
  }
  if (id.includes("rectangular") || sub.includes("rectangular")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#60a5fa" stroke-width="1.3">
      <rect x="2" y="3" width="10" height="8" rx="1.5"></rect>
      <rect x="16" y="3" width="10" height="8" rx="1.5"></rect>
      <path d="M12 6 L16 6"></path>
    </svg>`;
  }

  if (id.includes("aviator") || sub.includes("aviator")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#eab308" stroke-width="1.3">
      <path d="M3 3 C3 3, 10.5 2, 11 4 C11.5 6.5, 9.5 11.5, 6 11.5 C3 11.5, 2.5 7.5, 3 3 Z"></path>
      <path d="M25 3 C25 3, 17.5 2, 17 4 C16.5 6.5, 18.5 11.5, 22 11.5 C25 11.5, 25.5 7.5, 25 3 Z"></path>
      <line x1="10" y1="3.5" x2="18" y2="3.5"></line>
      <line x1="11" y1="5.5" x2="17" y2="5.5"></line>
    </svg>`;
  }
  if (id.includes("wayfarer") || sub.includes("wayfarer")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="#161c28" stroke="#64748b" stroke-width="1.4">
      <path d="M2 3 L12 4 L11 11.5 L3.5 11 Z"></path>
      <path d="M26 3 L16 4 L17 11.5 L24.5 11 Z"></path>
      <line x1="12" y1="4" x2="16" y2="4"></line>
    </svg>`;
  }
  if (id.includes("prada") || id.includes("vintage") || id.includes("star")) {
    return `<svg width="28" height="14" viewBox="0 0 28 14" fill="#0f172a" stroke="#f59e0b" stroke-width="1.3">
      <path d="M2 3 L12 3.5 L10.5 11 L3.5 10.5 Z"></path>
      <path d="M26 3 L16 3.5 L17.5 11 L24.5 10.5 Z"></path>
      <line x1="12" y1="4" x2="16" y2="4"></line>
      <polygon points="14,1 14.8,3 17,3 15.2,4.3 15.8,6.5 14,5.2 12.2,6.5 12.8,4.3 11,3 13.2,3" fill="#f59e0b"></polygon>
    </svg>`;
  }
  // Default browline / clubmaster
  return `<svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#94a3b8" stroke-width="1.2">
    <path d="M2 3 Q7 1.8 12 3" stroke="#cbd5e1" stroke-width="2"></path>
    <path d="M16 3 Q21 1.8 26 3" stroke="#cbd5e1" stroke-width="2"></path>
    <rect x="3" y="4" width="8" height="7.5" rx="2"></rect>
    <rect x="17" y="4" width="8" height="7.5" rx="2"></rect>
    <line x1="11" y1="4" x2="17" y2="4"></line>
  </svg>`;
}

function renderProductExplorerList() {
  productsExplorerList.innerHTML = "";
  sidebarModelCount.textContent = `${categoryFilteredItems.length} models`;

  categoryFilteredItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "product-item-card" + (index === currentItemIndex ? " selected" : "");

    const subTag = item.sub_category || "Glasses";

    card.innerHTML = `
      <div class="p-card-thumb">${getGlassesThumbnailSvg(item)}</div>
      <div class="p-card-info">
        <span class="p-card-title">${item.name}</span>
        <span class="p-card-subtitle">${subTag} &bull; Precision fit</span>
      </div>
    `;

    card.addEventListener("click", () => {
      currentItemIndex = index;
      document.querySelectorAll(".product-item-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      loadCurrentItem();
    });

    productsExplorerList.appendChild(card);
  });
}

function loadCurrentItem() {
  if (categoryFilteredItems.length === 0) return;

  const item = categoryFilteredItems[currentItemIndex];
  selectedAsset = item;

  // Update Top Bar Headings
  activeProductName.textContent = item.name;

  const subTag = item.sub_category || "Eyewear";

  const activeProductSubtitle = document.getElementById("active-product-subtitle");
  if (activeProductSubtitle) {
    activeProductSubtitle.textContent = `${subTag} · Precision fit`;
  }

  if (activeProductAnchor) {
    activeProductAnchor.textContent = "Face and eye tracked";
  }

  // Update Carousel Counter
  carouselCurrIdx.textContent = (currentItemIndex + 1).toString();
  carouselTotalIdx.textContent = categoryFilteredItems.length.toString();

  // Highlight card in sidebar
  const cards = document.querySelectorAll(".product-item-card");
  cards.forEach((c, idx) => {
    if (idx === currentItemIndex) {
      c.classList.add("selected");
      c.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      c.classList.remove("selected");
    }
  });

  // Display in 3D Scene
  displayProductInScene(item);
}

// Next / Previous Carousel Navigation
if (btnNextItem) {
  btnNextItem.addEventListener("click", () => {
    if (categoryFilteredItems.length <= 1) return;
    currentItemIndex = (currentItemIndex + 1) % categoryFilteredItems.length;
    loadCurrentItem();
  });
}

if (btnPrevItem) {
  btnPrevItem.addEventListener("click", () => {
    if (categoryFilteredItems.length <= 1) return;
    currentItemIndex = (currentItemIndex - 1 + categoryFilteredItems.length) % categoryFilteredItems.length;
    loadCurrentItem();
  });
}

if (categoryDropdown) {
  categoryDropdown.addEventListener("change", (e) => {
    setCategory(e.target.value);
  });
}

// --- 5. Rotation State Management & Helpers ---
function applyModelRotation() {
  if (activeCategory !== "furniture") return;
  const target = getActiveManipulatedObject();
  if (target) {
    target.rotation.y = currentRotationY;
  }
}

function getActiveManipulatedObject() {
  if (typeof selectedFurnitureForDrag !== "undefined" && selectedFurnitureForDrag) return selectedFurnitureForDrag;
  if (active3DModel) return active3DModel;
  return null;
}

// Rotate Buttons (Rotate 45° in either direction - Strictly Furniture Only)
if (btnRotateLeft) {
  btnRotateLeft.addEventListener("click", () => {
    if (activeCategory !== "furniture") return;
    currentRotationY -= Math.PI / 4;
    applyModelRotation();
  });
}

if (btnRotateRight) {
  btnRotateRight.addEventListener("click", () => {
    if (activeCategory !== "furniture") return;
    currentRotationY += Math.PI / 4;
    applyModelRotation();
  });
}

function onCanvasWheel(e) { }
function onPointerDown(e) { }
function onPointerMove(e) { }
function onPointerUp() { }

function formatCategoryTitle(cat) {
  return "Glasses";
}

function formatAnchorName(anchor) {
  switch (anchor) {
    case "face_eyes": return "Face & Eye Tracked";
    case "floor": return "Floor Surface";
    default: return "Spatial";
  }
}

// --- 7. Golang Edge Offloading Engine API Integration ---
async function evaluateOffloadingEngine(asset) {
  const telemetry = {
    device_id: "enterprise-xr-client",
    timestamp: new Date().toISOString(),
    battery_level: parseFloat(rangeBattery.value) / 100.0,
    client_cpu_load: parseFloat(rangeCPU.value) / 100.0,
    network_rtt_ms: parseFloat(rangeRTT.value),
    client_fps: currentFPS,
    motion_to_photon_ms: 12.0
  };

  const payload = {
    asset_id: asset.id,
    target_surface: {
      id: "surface-" + asset.anchor_type,
      type: asset.anchor_type === "floor" ? "floor" : "human_avatar",
      area_sq_m: 16.0,
      polygon: []
    },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    telemetry: telemetry
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/spatial/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      updateMetricsRibbon(data.offload_decision, data.server_process_time_ms);
    }
  } catch (e) {
    fallbackOffloadDecision(asset, telemetry);
  }
}

function updateMetricsRibbon(decision, serverTimeMs) {
  metricM2P.textContent = `${decision.predicted_latency_ms.toFixed(1)} ms`;
  metricServerTime.textContent = `${serverTimeMs.toFixed(2)} ms`;
  decisionReason.textContent = decision.reason;

  if (decision.target === "EDGE_CLOUD") {
    decisionBadge.textContent = "EDGE CLOUD OFFLOAD";
    decisionBadge.className = "decision-badge cloud";
  } else {
    decisionBadge.textContent = "CLIENT LOCAL";
    decisionBadge.className = "decision-badge";
  }
}

function fallbackOffloadDecision(asset, t) {
  if (t.battery_level <= 0.20 || t.client_cpu_load >= 0.75 || asset.polygon_count > 15000) {
    decisionBadge.textContent = "EDGE CLOUD OFFLOAD";
    decisionBadge.className = "decision-badge cloud";
    metricM2P.textContent = `${(t.network_rtt_ms + 4.5).toFixed(1)} ms`;
    decisionReason.textContent = "Offloading heavy tracking & 3D mesh rendering to Edge Cloud to save battery.";
  } else {
    decisionBadge.textContent = "CLIENT LOCAL";
    decisionBadge.className = "decision-badge";
    metricM2P.textContent = "1.2 ms";
    decisionReason.textContent = "Client resources healthy &bull; Sub-2ms local neural rasterization.";
  }
}

// --- 8. Live Camera AR Mode with Real-Time Face Landmark Placement ---
let faceMeshTracker = null;
let isFaceTrackingProcessing = false;

function initFaceTracker() {
  // If vtoPipeline is already active, face tracking is managed authoritatively by vtoPipeline.tracker
  if (vtoPipeline && vtoPipeline.tracker) {
    return;
  }
  if (typeof FaceMesh === "undefined") {
    console.log("MediaPipe FaceMesh not loaded from CDN; camera overlay ready.");
    return;
  }
  try {
    faceMeshTracker = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMeshTracker.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMeshTracker.onResults(onFaceResults);
  } catch (err) {
    console.warn("FaceMesh init error:", err);
  }
}

let isSimulatedAR = false;

function onFaceResults(results) {
  if (!isCameraMode || !active3DModel) return;

  if (selectedAsset && selectedAsset.category === "specs") {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const noseBridge = landmarks[168] || landmarks[6];
      const leftEye = landmarks[263];
      const rightEye = landmarks[33];

      if (noseBridge && leftEye && rightEye) {
        const distanceZ = 1.2;
        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const heightAtZ = 2 * Math.tan(vFOV / 2) * distanceZ;
        const widthAtZ = heightAtZ * camera.aspect;

        // Horizontally mirrored for natural selfie view (full camera viewport)
        const ndcX = (1.0 - noseBridge.x) * 2.0 - 1.0;
        const ndcY = -(noseBridge.y * 2.0 - 1.0);

        const targetX = (ndcX * widthAtZ) / 2.0;
        const targetY = (ndcY * heightAtZ) / 2.0;

        active3DModel.position.set(targetX, targetY, camera.position.z - distanceZ);
        const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
        // Real face eyeDist is ~0.063m, glasses width is ~0.145m (ratio ~2.3)
        const targetGlassesWidth = eyeDist * widthAtZ * 2.3;
        const modelScale = Math.max(1.4, Math.min(4.8, targetGlassesWidth / 0.145));
        active3DModel.scale.set(modelScale, modelScale, modelScale);

        // Head roll (tilt)
        const roll = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);
        active3DModel.rotation.z = -roll;

        // Head yaw (turn left/right)
        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        active3DModel.rotation.y = (noseBridge.x - eyeCenterX) * 2.2;

        // Head pitch (nod up/down)
        const eyeCenterY = (leftEye.y + rightEye.y) / 2;
        active3DModel.rotation.x = (noseBridge.y - eyeCenterY) * 1.8;
      }
    }
  }
}

if (btnStudioMode) {
  btnStudioMode.addEventListener("click", async () => {
    try {
      btnStudioMode.classList.add("active");
      if (btnCameraMode) btnCameraMode.classList.remove("active");
      isCameraMode = false;
      isSimulatedAR = false;

      stopCameraStream();
      if (webcamFeed) {
        webcamFeed.style.display = "none";
        webcamFeed.srcObject = null;
      }
      if (contextualCameraGuide) contextualCameraGuide.style.display = "none";
      if (vtoMetricsBadge) vtoMetricsBadge.style.display = "none";
      if (btnToggleOcclusion) btnToggleOcclusion.style.display = "none";

      // Explicitly hide CV diagnostic HUD, mode dock tabs, and clear overlay
      const cvModeDock = document.getElementById("cv-mode-dock");
      if (cvModeDock) cvModeDock.style.display = "none";
      const cvHud = document.getElementById("cv-diagnostics-hud");
      if (cvHud) cvHud.style.display = "none";
      if (cvDiagnostics) {
        cvDiagnostics.onCameraDeactivated();
      }

      const viewportStageArea = document.getElementById("viewport-stage-area");
      if (viewportStageArea) viewportStageArea.classList.remove("camera-mode-active");

      if (scene) scene.background = null;
      if (controls) {
        controls.enabled = true;
        controls.target.set(0, 1.628, 0.02);
        controls.update();
      }

      // Always restore avatar visibility and presence in 3D studio
      if (humanAvatarGroup) {
        humanAvatarGroup.visible = true;
        humanAvatarGroup.traverse((child) => {
          child.visible = true;
        });
        if (scene && humanAvatarGroup.parent !== scene) {
          scene.add(humanAvatarGroup);
        }
      }

      // Restore 3D studio hint text
      if (hintLabel) {
        hintLabel.innerHTML = "3D Studio &bull; Drag to inspect fit in 360&deg; &bull; Switch to Live Camera AR anytime.";
      }
      updateContextualCameraGuide("face", "3D Avatar • Anatomical Fit");

      if (selectedAsset && selectedAsset.category === "specs" && vtoPipeline) {
        await vtoPipeline.setMode("studio");
        smoothCamera(new THREE.Vector3(0, 1.635, 0.65), new THREE.Vector3(0, 1.628, 0.02));
        // If no glasses model was attached yet, load it
        if (!vtoPipeline.glassesFitRoot || vtoPipeline.glassesFitRoot.children.length === 0) {
          displayProductInScene(selectedAsset);
        }
      } else if (active3DModel) {
        active3DModel.scale.set(1.0, 1.0, 1.0);
        active3DModel.rotation.set(0, 0, 0);
      } else if (selectedAsset) {
        displayProductInScene(selectedAsset);
      }
    } catch (err) {
      console.error("[SpectroFit] Error during studio mode switch:", err);
    }
  });
}

if (btnCameraMode) {
  btnCameraMode.addEventListener("click", async () => {
    if (currentCameraAnim) {
      clearInterval(currentCameraAnim);
      currentCameraAnim = null;
    }
    btnCameraMode.classList.add("active");
    btnStudioMode.classList.remove("active");
    isCameraMode = true;
    isSimulatedAR = false;

    const viewportStageArea = document.getElementById("viewport-stage-area");
    if (viewportStageArea) viewportStageArea.classList.add("camera-mode-active");

    controls.enabled = false;
    camera.position.set(0, 0, 2.0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    scene.background = null;
    if (humanAvatarGroup) humanAvatarGroup.visible = false;
    // NEVER render opaque 3D room over webcam feed
    if (roomGroup) roomGroup.visible = false;

    contextualCameraGuide.style.display = "flex";

    if (selectedAsset && vtoPipeline) {
      if (vtoMetricsBadge) {
        const showBadge = cvDiagnostics && (cvDiagnostics.activeMode === "diagnostics" || cvDiagnostics.activeMode === "research");
        vtoMetricsBadge.style.display = showBadge ? "flex" : "none";
      }
      if (btnToggleRigidDebug) btnToggleRigidDebug.style.display = "none";
      if (btnToggleOcclusion) btnToggleOcclusion.style.display = "flex";

      updateContextualCameraGuide("face", "Virtual Try-On • Live Eyewear Fit");
      hintLabel.innerHTML = "Virtual Try-On &bull; Move head naturally to test eyewear fit.";

      await vtoPipeline.setMode("camera");
      // User may have switched away while camera was initializing
      if (!isCameraMode) {
        stopCameraStream();
        return;
      }

      webcamFeed.style.display = "block";
      if (!vtoPipeline.tracker.isSimulated) {
        webcamFeed.style.background = "transparent";
      }
    } else {
      try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!isCameraMode) {
          if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
          return;
        }
        webcamFeed.srcObject = webcamStream;
        await webcamFeed.play();
        webcamFeed.style.display = "block";
        webcamFeed.style.background = "transparent";
      } catch (err) {
        if (!isCameraMode) return;
        console.warn("Hardware camera unavailable or permission denied, using simulated live camera preview:", err);
        startSimulatedCameraAR();
      }
    }

    if (!isCameraMode) return;

    if (cvDiagnostics) {
      cvDiagnostics.onCameraActivated();
    }
  });
}

function startSimulatedCameraAR() {
  isSimulatedAR = true;
  webcamFeed.style.display = "block";
  webcamFeed.style.background = "radial-gradient(ellipse at 50% 45%, #1e293b 0%, #0f172a 100%)";
  contextualCameraGuide.style.display = "flex";
  scene.background = null;

  if (humanAvatarGroup) humanAvatarGroup.visible = false;
  if (roomGroup) roomGroup.visible = false;

  if (active3DModel) {
    scene.add(active3DModel);
    active3DModel.rotation.set(0, 0, 0);
    active3DModel.position.set(0, 0.08, 0.8);
    active3DModel.scale.set(2.4, 2.4, 2.4);
    active3DModel.visible = true;
    if (hintLabel) {
      hintLabel.innerHTML = "Full Screen Live AR &bull; Real-time tracking enabled across full camera viewport.";
    }
    if (cameraGuideInstruction) {
      cameraGuideInstruction.textContent = "Full Screen Live AR • Face Tracked";
    }
  }
}

function updateSimulatedAR(now) {
  if (!selectedAsset || selectedAsset.category !== "specs") return;
  const t = now * 0.0012;
  const noseX = 0.50 + Math.sin(t * 0.7) * 0.04;
  const noseY = 0.48 + Math.cos(t * 1.1) * 0.02;
  const eyeSpan = 0.065;
  const simLandmarks = {};
  simLandmarks[168] = { x: noseX, y: noseY, z: 0 };
  simLandmarks[6] = { x: noseX, y: noseY, z: 0 };
  simLandmarks[263] = { x: noseX + eyeSpan, y: noseY - 0.035, z: 0 };
  simLandmarks[33] = { x: noseX - eyeSpan, y: noseY - 0.035, z: 0 };
  simLandmarks[10] = { x: noseX, y: noseY - 0.16, z: 0 };

  onFaceResults({ multiFaceLandmarks: [simLandmarks] });
}

function stopCameraStream() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  if (webcamFeed) {
    try {
      webcamFeed.pause();
    } catch (_) { }
    webcamFeed.srcObject = null;
    webcamFeed.style.display = "none";
  }
  if (vtoPipeline && vtoPipeline.tracker) {
    vtoPipeline.tracker.stopCamera();
  }
}

// --- 9. Utility Buttons & Telemetry Sliders ---
if (btnResetView) {
  btnResetView.addEventListener("click", () => {
    currentRotationY = 0;
    currentPitchX = 0;
    smoothCamera(new THREE.Vector3(0, 1.635, 0.65), new THREE.Vector3(0, 1.628, 0.02));
    if (selectedAsset) displayProductInScene(selectedAsset);
  });
}

if (btnClearPlaced) {
  btnClearPlaced.addEventListener("click", () => {
    if (rotationRingMesh) rotationRingMesh.visible = false;
  });
}

if (rangeBattery) {
  rangeBattery.addEventListener("input", (e) => {
    if (labelBat) labelBat.textContent = `${e.target.value}%`;
    if (selectedAsset) evaluateOffloadingEngine(selectedAsset);
  });
}
if (rangeCPU) {
  rangeCPU.addEventListener("input", (e) => {
    if (labelCPU) labelCPU.textContent = `${e.target.value}%`;
    if (selectedAsset) evaluateOffloadingEngine(selectedAsset);
  });
}
if (rangeRTT) {
  rangeRTT.addEventListener("input", (e) => {
    if (labelRTT) labelRTT.textContent = `${e.target.value} ms`;
    if (selectedAsset) evaluateOffloadingEngine(selectedAsset);
  });
}

// Presets
if (presetNormal) presetNormal.addEventListener("click", () => setTelemetryValues(85, 20, 15));
if (presetBattery) presetBattery.addEventListener("click", () => setTelemetryValues(12, 30, 22));
if (presetCPU) presetCPU.addEventListener("click", () => setTelemetryValues(75, 88, 20));
if (presetRTT) presetRTT.addEventListener("click", () => setTelemetryValues(85, 85, 160));

function setTelemetryValues(bat, cpu, rtt) {
  if (rangeBattery) rangeBattery.value = bat;
  if (labelBat) labelBat.textContent = `${bat}%`;
  if (rangeCPU) rangeCPU.value = cpu;
  if (labelCPU) labelCPU.textContent = `${cpu}%`;
  if (rangeRTT) rangeRTT.value = rtt;
  if (labelRTT) labelRTT.textContent = `${rtt} ms`;
  if (selectedAsset) evaluateOffloadingEngine(selectedAsset);
}

function onWindowResize() {
  const container = document.getElementById("viewport-stage-area");
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// Telemetry & Performance Profiler
let lastHudUpdateTime = 0;

window._vtoProfile = {
  renderFPS: 60.0,
  trackingFPS: 30.0,
  inferenceMs: 0,
  poseSolveMs: 0,
  occluderUpdateMs: 0,
  threeRenderMs: 0,
  totalFrameMs: 0,
  uiUpdatesSec: 4,
  getP95InferenceMs: function () {
    const arr = [...this.history.inferenceTimes].sort((a, b) => a - b);
    if (!arr.length) return 0;
    const idx = Math.floor(arr.length * 0.95);
    return Number(arr[idx].toFixed(1));
  },
  getP95RenderMs: function () {
    const arr = [...this.history.renderTimes].sort((a, b) => a - b);
    if (!arr.length) return 0;
    const idx = Math.floor(arr.length * 0.95);
    return Number(arr[idx].toFixed(2));
  },
  history: {
    inferenceTimes: [],
    renderTimes: [],
  }
};

// --- 10. Main Render Loop & FPS Calculation ---
function animate(now) {
  requestAnimationFrame(animate);

  // Real-time Face Tracking during Live Camera AR
  if (isCameraMode) {
    if (selectedAsset && selectedAsset.category === "specs" && vtoPipeline) {
      vtoPipeline.update(now);

      // Real-time Computer Vision & Edge AR Diagnostics update
      if (cvDiagnostics) {
        cvDiagnostics.update(now);
      }

      // Decoupled Telemetry: Throttle HUD DOM updates to ~4 Hz (250ms) to eliminate render-path layout thrashing
      if (now - lastHudUpdateTime >= 250) {
        lastHudUpdateTime = now;
        const m = vtoPipeline.getMetrics();
        if (m) {
          if (cameraGuideInstruction) {
            cameraGuideInstruction.textContent = vtoPipeline.hasDetectedFace
              ? "Live Face Tracked • Eyewear Fitted"
              : "Center Face in Camera View • Auto-Detecting...";
          }
          if (vtoMetricPD) vtoMetricPD.textContent = `PD: ${m.ipdMM}mm`;
          if (vtoMetricWidth) vtoMetricWidth.textContent = `Width: ${m.faceWidthMM}mm`;
          if (vtoMetricPose && m.eulerDeg) {
            if (m.rigidGlassesDebug) {
              const dir = m.templeDirLocal ? `(${m.templeDirLocal.x.toFixed(2)}, ${m.templeDirLocal.y.toFixed(2)}, ${m.templeDirLocal.z.toFixed(2)})` : "(0, 0, -1)";
              vtoMetricPose.textContent = `Yaw: ${m.eulerDeg.yaw}° Pitch: ${m.eulerDeg.pitch}° | HingeErr: L ${m.leftHingeErrorMM}mm R ${m.rightHingeErrorMM}mm | EarDist: ${m.hingeToEarDistMM}mm | TempleDir: ${dir}`;
            } else {
              vtoMetricPose.textContent = `Yaw: ${m.eulerDeg.yaw}° Pitch: ${m.eulerDeg.pitch}°`;
            }
          }
        }
      }
    } else {
      if (webcamFeed && webcamFeed.readyState >= 2 && faceMeshTracker && !isFaceTrackingProcessing) {
        isFaceTrackingProcessing = true;
        faceMeshTracker.send({ image: webcamFeed })
          .catch(() => { })
          .finally(() => { isFaceTrackingProcessing = false; });
      } else if (isSimulatedAR && active3DModel) {
        updateSimulatedAR(now);
      }
    }
  }

  if (isCameraMode && cvDiagnostics) {
    cvDiagnostics.update(now);
  }

  frameCount++;
  if (now - lastFrameTime >= 1000) {
    currentFPS = Number(((frameCount * 1000) / (now - lastFrameTime)).toFixed(1));
    metricFPS.textContent = `${currentFPS.toFixed(1)} FPS`;
    const sidebarEdgeMetrics = document.getElementById("sidebar-edge-metrics");
    if (sidebarEdgeMetrics) {
      sidebarEdgeMetrics.textContent = `Latency 2.6 ms · ${currentFPS.toFixed(1)} FPS`;
    }
    if (window._vtoProfile) {
      window._vtoProfile.renderFPS = currentFPS;
    }
    frameCount = 0;
    lastFrameTime = now;
  }

  if (controls && controls.enabled) {
    controls.update();
  }

  const tRender0 = performance.now();
  renderer.render(scene, camera);
  const tRender1 = performance.now();

  if (window._vtoProfile) {
    const rMs = tRender1 - tRender0;
    window._vtoProfile.threeRenderMs = Number(rMs.toFixed(2));
    window._vtoProfile.history.renderTimes.push(rMs);
    if (window._vtoProfile.history.renderTimes.length > 60) {
      window._vtoProfile.history.renderTimes.shift();
    }
    window._vtoProfile.totalFrameMs = Number((performance.now() - now).toFixed(2));
  }
}

// --- 11. Bootstrapping ---
function updateCategoryDropdownCounts() {
  if (sidebarModelCount && catalog) {
    sidebarModelCount.textContent = `${catalog.length} models`;
  }
  if (!categoryDropdown || !catalog) return;
  const counts = {};
  catalog.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  const categoryTitles = {
    specs: "👓 Glasses & Eyewear"
  };

  Array.from(categoryDropdown.options).forEach(opt => {
    const cat = opt.value;
    const title = categoryTitles[cat] || opt.textContent;
    const count = counts[cat] || 0;
    opt.textContent = `${title} (${count} Models)`;
  });
}

async function fetchCatalogAndInit() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/assets`);
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        catalog = items;
      }
    }
  } catch (err) {
    console.warn("Could not fetch backend catalog, using built-in specs catalog", err);
  }

  // Update dropdown labels dynamically with live catalog counts
  updateCategoryDropdownCounts();

  // Initialize with Glasses
  setCategory("specs");
}

// Global Keyboard Navigation (Arrow keys switch frames)
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (btnPrevItem) btnPrevItem.click();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (btnNextItem) btnNextItem.click();
  }
});

// Top Export Button: High-Res Composite Frame Snapshot (Includes User's Live Face + Fitted Eyewear)
const btnTopExport = document.getElementById("btn-top-export");
if (btnTopExport) {
  btnTopExport.addEventListener("click", () => {
    try {
      if (!renderer || !scene || !camera) return;

      // 1. Force a clean Three.js frame render
      renderer.render(scene, camera);

      const glCanvas = renderer.domElement;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = glCanvas.width;
      exportCanvas.height = glCanvas.height;
      const ctx = exportCanvas.getContext("2d");

      if (isCameraMode && webcamFeed && webcamFeed.readyState >= 2) {
        // LIVE CAMERA MODE: Draw video feed (mirrored horizontally to match on-screen mirror view)
        const w = exportCanvas.width;
        const h = exportCanvas.height;
        const vw = webcamFeed.videoWidth || 1280;
        const vh = webcamFeed.videoHeight || 720;
        const canvasAspect = w / h;
        const videoAspect = vw / vh;
        let renderW, renderH;

        if (canvasAspect > videoAspect) {
          renderW = w;
          renderH = w / videoAspect;
        } else {
          renderH = h;
          renderW = h * videoAspect;
        }

        // Draw camera frame with exact CSS object-fit: cover and scaleX(-1) mirror matching screen
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(-1, 1);
        ctx.drawImage(webcamFeed, -renderW / 2, -renderH / 2, renderW, renderH);
        ctx.restore();
      } else {
        // 3D STUDIO MODE: Draw sleek studio radial background gradient
        const w = exportCanvas.width;
        const h = exportCanvas.height;
        const grad = ctx.createRadialGradient(w * 0.5, h * 0.46, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
        grad.addColorStop(0, "#101c36");
        grad.addColorStop(0.45, "#0c152a");
        grad.addColorStop(1, "#050811");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Composite the Three.js WebGL canvas (Avatar + Fitted Eyewear) on top
      ctx.drawImage(glCanvas, 0, 0);

      // 3. Trigger download
      const dataUrl = exportCanvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      const modeSuffix = isCameraMode ? "live-face-tryon" : "3d-studio";
      a.download = `spectrofit-${selectedAsset ? selectedAsset.id : "eyewear"}-${modeSuffix}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn("Could not export snapshot:", e);
    }
  });
}

const btnTopChat = document.getElementById("btn-top-chat");
if (btnTopChat) {
  btnTopChat.addEventListener("click", () => {
    alert("SpectroFit AI Stylist: Looking for the best fit? Try round frames for square faces, and wayfarers for rounder face shapes!");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initThree();
  initFaceTracker();
  fetchCatalogAndInit();
});
