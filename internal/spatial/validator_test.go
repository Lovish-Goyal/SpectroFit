package spatial

import (
	"testing"

	"github.com/spatial-mesh-ar/engine/pkg/models"
)

func TestSpatialValidator(t *testing.T) {
	validator := NewSpatialValidator()

	chair := models.ARAsset{
		ID:       "chair-1",
		Category: "chair",
		BoundingBox: models.BoundingBox{
			Min: models.Vector3{X: -0.3, Y: 0, Z: -0.3},
			Max: models.Vector3{X: 0.3, Y: 0.9, Z: 0.3},
		},
	}

	roomFloor := models.RoomSurface{
		ID:      "floor-01",
		Type:    "floor",
		AreaSqM: 16.0,
		Polygon: []models.Vector3{
			{X: -2.0, Y: 0, Z: -2.0},
			{X: 2.0, Y: 0, Z: -2.0},
			{X: 2.0, Y: 0, Z: 2.0},
			{X: -2.0, Y: 0, Z: 2.0},
		},
	}

	t.Run("Valid placement inside room boundary", func(t *testing.T) {
		req := models.PlacementRequest{
			AssetID:       chair.ID,
			TargetSurface: roomFloor,
			Position:      models.Vector3{X: 0.5, Y: 0.0, Z: 0.5},
		}

		valid, msg := validator.ValidatePlacement(chair, req)
		if !valid {
			t.Fatalf("Expected valid placement, got: %s", msg)
		}
		validator.RegisterPlacement("instance-01", chair, req)
	})

	t.Run("Prevent placement outside detected room polygon", func(t *testing.T) {
		req := models.PlacementRequest{
			AssetID:       chair.ID,
			TargetSurface: roomFloor,
			Position:      models.Vector3{X: 5.0, Y: 0.0, Z: 5.0}, // Outside 4x4 room
		}

		valid, msg := validator.ValidatePlacement(chair, req)
		if valid {
			t.Fatalf("Expected out of bounds error, but placement was approved: %s", msg)
		}
	})

	t.Run("Prevent physical collision with existing placed furniture", func(t *testing.T) {
		// Overlapping with instance-01 at (0.5, 0, 0.5)
		req := models.PlacementRequest{
			AssetID:       chair.ID,
			TargetSurface: roomFloor,
			Position:      models.Vector3{X: 0.6, Y: 0.0, Z: 0.5},
		}

		valid, msg := validator.ValidatePlacement(chair, req)
		if valid {
			t.Fatalf("Expected collision error, but was approved: %s", msg)
		}
	})

	t.Run("Surface compatibility rejection (chair on wall)", func(t *testing.T) {
		wallSurface := models.RoomSurface{
			ID:      "wall-01",
			Type:    "wall",
			AreaSqM: 8.0,
		}
		req := models.PlacementRequest{
			AssetID:       chair.ID,
			TargetSurface: wallSurface,
			Position:      models.Vector3{X: 0, Y: 1.5, Z: -2.0},
		}

		valid, msg := validator.ValidatePlacement(chair, req)
		if valid {
			t.Fatalf("Expected surface compatibility rejection, but was approved: %s", msg)
		}
	})
}
