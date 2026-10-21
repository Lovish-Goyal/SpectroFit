package spatial

import (
	"fmt"
	"math"
	"sync"

	"github.com/spatial-mesh-ar/engine/pkg/models"
)

// PlacedInstance records an active AR asset placed in 3D world space
type PlacedInstance struct {
	InstanceID string             `json:"instance_id"`
	AssetID    string             `json:"asset_id"`
	Position   models.Vector3     `json:"position"`
	Bounds     models.BoundingBox `json:"bounds"`
	SurfaceID  string             `json:"surface_id"`
}

// SpatialValidator manages 3D world boundaries and prevents collisions
type SpatialValidator struct {
	mu            sync.RWMutex
	placedObjects map[string]PlacedInstance
}

// NewSpatialValidator initializes a thread-safe spatial collision manager
func NewSpatialValidator() *SpatialValidator {
	return &SpatialValidator{
		placedObjects: make(map[string]PlacedInstance),
	}
}

// ValidatePlacement checks surface type compatibility, polygon boundary containment, and object collisions
func (v *SpatialValidator) ValidatePlacement(asset models.ARAsset, req models.PlacementRequest) (bool, string) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	// 1. Surface Type Compatibility Check
	if errStr := v.checkSurfaceCompatibility(asset.Category, req.TargetSurface.Type); errStr != "" {
		return false, errStr
	}

	// 2. Minimum Area Check
	footprintArea := math.Abs(asset.BoundingBox.Max.X-asset.BoundingBox.Min.X) * math.Abs(asset.BoundingBox.Max.Z-asset.BoundingBox.Min.Z)
	if req.TargetSurface.AreaSqM > 0 && footprintArea > req.TargetSurface.AreaSqM {
		return false, fmt.Sprintf("ASSET_TOO_LARGE: Asset footprint (%.2f sq m) exceeds surface area (%.2f sq m)", footprintArea, req.TargetSurface.AreaSqM)
	}

	// 3. Point-in-Polygon Boundary Check (if polygon vertices provided)
	if len(req.TargetSurface.Polygon) >= 3 {
		inside := isPointInPolygon(req.Position.X, req.Position.Z, req.TargetSurface.Polygon)
		if !inside {
			return false, "OUT_OF_BOUNDS: Selected position is outside the detected room surface polygon"
		}
	}

	// 4. Overlap & Collision with Existing Placed Assets
	candidateBounds := v.computeWorldBounds(req.Position, asset.BoundingBox)
	for id, placed := range v.placedObjects {
		if v.intersects(candidateBounds, placed.Bounds) {
			return false, fmt.Sprintf("COLLISION_DETECTED: Overlaps with existing object %s (%s)", placed.AssetID, id)
		}
	}

	return true, "VALID_PLACEMENT"
}

// RegisterPlacement persists an approved placement into the spatial scene graph
func (v *SpatialValidator) RegisterPlacement(instanceID string, asset models.ARAsset, req models.PlacementRequest) {
	v.mu.Lock()
	defer v.mu.Unlock()

	bounds := v.computeWorldBounds(req.Position, asset.BoundingBox)
	v.placedObjects[instanceID] = PlacedInstance{
		InstanceID: instanceID,
		AssetID:    asset.ID,
		Position:   req.Position,
		Bounds:     bounds,
		SurfaceID:  req.TargetSurface.ID,
	}
}

// ClearScene resets the active spatial scene
func (v *SpatialValidator) ClearScene() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.placedObjects = make(map[string]PlacedInstance)
}

// GetActiveObjects returns a copy of current placed items
func (v *SpatialValidator) GetActiveObjects() []PlacedInstance {
	v.mu.RLock()
	defer v.mu.RUnlock()

	items := make([]PlacedInstance, 0, len(v.placedObjects))
	for _, item := range v.placedObjects {
		items = append(items, item)
	}
	return items
}

// Helper: Surface Category Rules
func (v *SpatialValidator) checkSurfaceCompatibility(assetCategory, surfaceType string) string {
	switch assetCategory {
	case "furniture", "chair", "sofa", "desk", "wardrobe", "bookshelf":
		if surfaceType != "floor" && surfaceType != "ground" {
			return fmt.Sprintf("INVALID_SURFACE: Furniture '%s' can only be placed on 'floor' (target is '%s')", assetCategory, surfaceType)
		}
	case "specs":
		if surfaceType != "face_eyes" && surfaceType != "human_avatar" && surfaceType != "floor" && surfaceType != "table" {
			return fmt.Sprintf("INVALID_ANCHOR: Eyewear requires face/eye anchor or surface preview (target is '%s')", surfaceType)
		}
	}
	return ""
}

// Helper: Compute absolute AABB bounding box in 3D world space
func (v *SpatialValidator) computeWorldBounds(pos models.Vector3, local models.BoundingBox) models.BoundingBox {
	return models.BoundingBox{
		Min: models.Vector3{
			X: pos.X + local.Min.X,
			Y: pos.Y + local.Min.Y,
			Z: pos.Z + local.Min.Z,
		},
		Max: models.Vector3{
			X: pos.X + local.Max.X,
			Y: pos.Y + local.Max.Y,
			Z: pos.Z + local.Max.Z,
		},
	}
}

// Helper: Axis-Aligned Bounding Box (AABB) 3D Intersection Test
func (v *SpatialValidator) intersects(a, b models.BoundingBox) bool {
	return (a.Min.X <= b.Max.X && a.Max.X >= b.Min.X) &&
		(a.Min.Y <= b.Max.Y && a.Max.Y >= b.Min.Y) &&
		(a.Min.Z <= b.Max.Z && a.Max.Z >= b.Min.Z)
}

// Ray-casting algorithm for 2D Point-in-Polygon containment test on the horizontal X-Z floor plane
func isPointInPolygon(px, pz float64, polygon []models.Vector3) bool {
	inside := false
	n := len(polygon)
	j := n - 1
	for i := 0; i < n; i++ {
		xi, zi := polygon[i].X, polygon[i].Z
		xj, zj := polygon[j].X, polygon[j].Z

		intersect := ((zi > pz) != (zj > pz)) &&
			(px < (xj-xi)*(pz-zi)/(zj-zi)+xi)
		if intersect {
			inside = !inside
		}
		j = i
	}
	return inside
}
