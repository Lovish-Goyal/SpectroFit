# 3D Model Asset Repository (Amazon / IKEA Spatial Format)

Place your `.glb` or `.gltf` 3D model files into these corresponding subfolders. The SpectroFit AR engine will automatically detect and load your downloaded/custom models. If any file is missing, the engine automatically falls back to procedural geometric meshes so the app remains 100% operational at all times.

## Directory Mapping

### 1. `web/models/specs/` (Glasses & Eyewear)
- `specs-aviator.glb` (Gold Titanium Aviator)
- `specs-wayfarer.glb` (Classic Acetate Wayfarer)
- `specs-round.glb` (Minimalist Round Wire Frames)
- `specs-clubmaster.glb` (Retro Browline Clubmaster)
- `specs-matte-black.glb` (Matte Black Square Sunglasses)
- `specs-sport-shield.glb` (Aerodynamic Sport Shield Glasses)
- `specs-rectangular.glb` (Executive Rectangular Optical Frames)
- `specs-oakley-sport.glb` (Oakley Flat-Top Sport Sunglasses)
- `specs-cyber-visor.glb` (Cyberpunk Smart HUD Visor)

### 2. `web/models/furniture/` (Room Furniture & Decor)
- `table-dining.glb` (Executive Wooden Desk)
- `chair-nordic.glb` (Nordic Minimalist Oak Chair)
- `chair-office.glb` (Ergonomic Office Chair)
- `table-folding.glb` (Foldable Utility Table)
- `table-dining-set.glb` (Dining Suite & Chairs)
- `sofa-lounge.glb` (Luxury Leather Recliner Sofa)
- `table-coffee.glb` (Minimalist Marble Coffee Table)

### 3. `web/models/human/` (Anatomical Human Head & Bust Reference)
- `human_male_bust.glb` (Realistic Male Portrait reference)
- `mannequin_head.glb` (Studio Eyewear Mannequin head)

## Asset Recommended Guidelines:
- Format: Binary GLTF (`.glb`) with embedded PBR textures.
- Origin Point: Placed at base center `(0, 0, 0)` for furniture; at nasal bridge for glasses.
- Polygon Budget: Low-Poly (< 15k polygons) for mobile client; High-Poly (> 50k polygons) to trigger Edge Cloud offloading.
