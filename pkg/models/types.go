package models

import "time"

// Vector3 represents a 3D coordinate in spatial space (meters)
type Vector3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// BoundingBox defines the physical footprint of a 3D AR asset
type BoundingBox struct {
	Min Vector3 `json:"min"`
	Max Vector3 `json:"max"`
}

// RoomSurface represents detected spatial planes (floors, walls, tables) from WebXR
type RoomSurface struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"` // "floor", "wall", "ceiling", "table"
	Polygon    []Vector3 `json:"polygon"`
	Normal     Vector3   `json:"normal"`
	AreaSqM    float64   `json:"area_sq_m"`
	Confidence float64   `json:"confidence"` // 0.0 to 1.0 (XR tracking confidence)
}

// ARAsset represents a 3D model candidate to be rendered in the room or on the body
type ARAsset struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	Category     string      `json:"category"`    // "specs", "furniture"
	AnchorType   string      `json:"anchor_type"` // "face_eyes", "floor"
	SubCategory  string      `json:"sub_category"`
	PolygonCount int         `json:"polygon_count"`
	BoundingBox  BoundingBox `json:"bounding_box"`
	LODLevel     string      `json:"lod_level"` // "LOW", "MEDIUM", "HIGH"
	ModelURL     string      `json:"model_url"`
	PriceUSD     float64     `json:"price_usd"`
}

// DeviceTelemetry captures client-side device constraints in real-time
type DeviceTelemetry struct {
	DeviceID              string    `json:"device_id"`
	Timestamp             time.Time `json:"timestamp"`
	BatteryLevel          float64   `json:"battery_level"`           // 0.0 - 1.0 (e.g., 0.20 = 20%)
	ClientCPULoad         float64   `json:"client_cpu_load"`         // 0.0 - 1.0 (e.g., 0.85 = 85%)
	NetworkRTTMs          float64   `json:"network_rtt_ms"`          // Round-trip network ping in ms
	ClientFPS             float64   `json:"client_fps"`              // Frames per second (target 60 or 90 FPS)
	MotionToPhotonLatency float64   `json:"motion_to_photon_ms"`     // Total motion-to-photon latency
}

// ExecutionTarget specifies where computation or rendering processing takes place
type ExecutionTarget string

const (
	TargetClientLocal ExecutionTarget = "CLIENT_LOCAL"
	TargetEdgeCloud   ExecutionTarget = "EDGE_CLOUD"
)

// OffloadDecision is emitted by our dynamic heuristic offloader engine
type OffloadDecision struct {
	AssetID            string          `json:"asset_id"`
	Target             ExecutionTarget `json:"target"`
	RecommendedLOD     string          `json:"recommended_lod"` // "LOW", "MEDIUM", "HIGH"
	PredictedLatencyMs float64         `json:"predicted_latency_ms"`
	Reason             string          `json:"reason"`
	EvaluatedAt        time.Time       `json:"evaluated_at"`
}

// PlacementRequest is the incoming payload when user places an asset on a surface
type PlacementRequest struct {
	AssetID       string          `json:"asset_id"`
	TargetSurface RoomSurface     `json:"target_surface"`
	Position      Vector3         `json:"position"`
	Rotation      Vector3         `json:"rotation"`
	Telemetry     DeviceTelemetry `json:"telemetry"`
}

// PlacementResponse returns the computed validation and offload strategy
type PlacementResponse struct {
	Valid               bool            `json:"valid"`
	OffloadDecision     OffloadDecision `json:"offload_decision"`
	Message             string          `json:"message"`
	ServerProcessTimeMs float64         `json:"server_process_time_ms"`
}
