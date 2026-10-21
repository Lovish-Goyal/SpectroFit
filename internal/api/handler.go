package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/spatial-mesh-ar/engine/internal/metrics"
	"github.com/spatial-mesh-ar/engine/internal/offloader"
	"github.com/spatial-mesh-ar/engine/internal/spatial"
	"github.com/spatial-mesh-ar/engine/pkg/models"
)

// Server encapsulates the HTTP API and domain subsystems
type Server struct {
	router    *http.ServeMux
	offloader *offloader.DecisionEngine
	spatial   *spatial.SpatialValidator
	metrics   *metrics.Metrics
	assets    map[string]models.ARAsset
}

// NewServer configures API routes and default asset catalog
func NewServer(offloader *offloader.DecisionEngine, validator *spatial.SpatialValidator, metrics *metrics.Metrics) *Server {
	s := &Server{
		router:    http.NewServeMux(),
		offloader: offloader,
		spatial:   validator,
		metrics:   metrics,
		assets:    initAssetCatalog(),
	}
	s.routes()
	return s
}

func initAssetCatalog() map[string]models.ARAsset {
	return map[string]models.ARAsset{
		// 👓 Glasses & Eyewear (Face / Eye Anchor)
		"specs-aviator": {
			ID:           "specs-aviator",
			Name:         "Gold Titanium Aviator",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Aviator",
			PolygonCount: 3400,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.07, Y: -0.025, Z: -0.07},
				Max: models.Vector3{X: 0.07, Y: 0.025, Z: 0.07},
			},
			LODLevel: "HIGH",
			PriceUSD: 160.00,
		},
		"specs-wayfarer": {
			ID:           "specs-wayfarer",
			Name:         "Classic Acetate Wayfarer",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Wayfarer",
			PolygonCount: 4200,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.072, Y: -0.026, Z: -0.07},
				Max: models.Vector3{X: 0.072, Y: 0.026, Z: 0.07},
			},
			LODLevel: "HIGH",
			PriceUSD: 145.00,
		},
		"specs-round": {
			ID:           "specs-round",
			Name:         "Minimalist Round Wire Frames",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Round",
			PolygonCount: 2900,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.065, Y: -0.025, Z: -0.065},
				Max: models.Vector3{X: 0.065, Y: 0.025, Z: 0.065},
			},
			LODLevel: "LOW",
			PriceUSD: 120.00,
		},
		"specs-clubmaster": {
			ID:           "specs-clubmaster",
			Name:         "Retro Browline Clubmaster",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Square",
			PolygonCount: 4600,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.07, Y: -0.028, Z: -0.07},
				Max: models.Vector3{X: 0.07, Y: 0.028, Z: 0.07},
			},
			LODLevel: "HIGH",
			PriceUSD: 175.00,
		},
		"specs-matte-black": {
			ID:           "specs-matte-black",
			Name:         "Matte Black Square Sunglasses",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Square",
			PolygonCount: 1004,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.072, Y: -0.025, Z: -0.07},
				Max: models.Vector3{X: 0.072, Y: 0.025, Z: 0.07},
			},
			LODLevel: "LOW",
			PriceUSD: 130.00,
		},
		"specs-sport-shield": {
			ID:           "specs-sport-shield",
			Name:         "Aerodynamic Sport Shield Glasses",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Sport",
			PolygonCount: 32152, // High poly mesh for compute offloading
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.075, Y: -0.028, Z: -0.075},
				Max: models.Vector3{X: 0.075, Y: 0.028, Z: 0.075},
			},
			LODLevel: "HIGH",
			PriceUSD: 210.00,
		},
		"specs-rectangular": {
			ID:           "specs-rectangular",
			Name:         "Executive Rectangular Optical Frames",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Rectangular",
			PolygonCount: 1904,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.07, Y: -0.022, Z: -0.07},
				Max: models.Vector3{X: 0.07, Y: 0.022, Z: 0.07},
			},
			LODLevel: "LOW",
			PriceUSD: 155.00,
		},

		"specs-prada-vintage": {
			ID:           "specs-prada-vintage",
			Name:         "Prada Vintage Star Sunglasses",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Designer",
			PolygonCount: 5200,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.072, Y: -0.026, Z: -0.07},
				Max: models.Vector3{X: 0.072, Y: 0.026, Z: 0.07},
			},
			LODLevel: "HIGH",
			PriceUSD: 310.00,
		},

		"specs-new1": {
			ID:           "specs-new1",
			Name:         "Cyber Stealth Modern Frames (New 1)",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Designer",
			PolygonCount: 52435,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.072, Y: -0.024, Z: -0.07},
				Max: models.Vector3{X: 0.072, Y: 0.024, Z: 0.07},
			},
			LODLevel: "HIGH",
			PriceUSD: 185.00,
		},

		"specs-new2": {
			ID:           "specs-new2",
			Name:         "Horizon Minimalist Wireframe (New 2)",
			Category:     "specs",
			AnchorType:   "face_eyes",
			SubCategory:  "Modern",
			PolygonCount: 4948,
			BoundingBox: models.BoundingBox{
				Min: models.Vector3{X: -0.071, Y: -0.022, Z: -0.07},
				Max: models.Vector3{X: 0.071, Y: 0.022, Z: 0.07},
			},
			LODLevel: "LOW",
			PriceUSD: 165.00,
		},
	}
}

func (s *Server) routes() {
	// Kubernetes Health Probes
	s.router.HandleFunc("GET /healthz", s.handleHealth)

	// Prometheus Metrics Scrape Endpoint
	s.router.Handle("GET /metrics", promhttp.Handler())

	// AR Spatial & Offloading APIs
	s.router.HandleFunc("GET /api/v1/assets", s.handleGetAssets)
	s.router.HandleFunc("POST /api/v1/spatial/validate", s.handleValidatePlacement)
	s.router.HandleFunc("POST /api/v1/telemetry", s.handleTelemetry)
	s.router.HandleFunc("GET /api/v1/spatial/scene", s.handleGetScene)
	s.router.HandleFunc("POST /api/v1/spatial/clear", s.handleClearScene)

	// WebXR Frontend static files & sketch_models
	s.router.Handle("GET /sketch_models/", http.StripPrefix("/sketch_models/", http.FileServer(http.Dir("sketch_models"))))
	s.router.Handle("GET /", http.FileServer(http.Dir("web")))
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for WebXR frontend
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// Disable caching for frontend assets to ensure instant hot-reloading
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	s.router.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "UP", "cluster": "spectrofit-cluster"})
}

func (s *Server) handleGetAssets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	items := make([]models.ARAsset, 0, len(s.assets))
	for _, a := range s.assets {
		items = append(items, a)
	}
	json.NewEncoder(w).Encode(items)
}

func (s *Server) handleValidatePlacement(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	var req models.PlacementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	asset, exists := s.assets[req.AssetID]
	if !exists {
		http.Error(w, fmt.Sprintf("Asset '%s' not found in catalog", req.AssetID), http.StatusNotFound)
		return
	}

	// 1. Record incoming device telemetry into Prometheus
	s.metrics.RecordTelemetry(req.Telemetry)

	// 2. Validate Spatial Geometry & Collision Bounds
	valid, spatialMsg := s.spatial.ValidatePlacement(asset, req)

	// 3. Evaluate Dynamic Offloading Heuristic Decision
	decision := s.offloader.Evaluate(asset, req.Telemetry)

	// 4. Record Offloading Metrics
	s.metrics.RecordDecision(decision)

	// 5. If valid, register placement in spatial state graph
	if valid {
		instanceID := fmt.Sprintf("%s-%d", asset.ID, time.Now().UnixNano()%10000)
		s.spatial.RegisterPlacement(instanceID, asset, req)
		s.metrics.ActivePlacements.Set(float64(len(s.spatial.GetActiveObjects())))
	}

	elapsed := float64(time.Since(start).Microseconds()) / 1000.0
	s.metrics.ServerProcessDuration.Observe(elapsed)

	resp := models.PlacementResponse{
		Valid:               valid,
		OffloadDecision:     decision,
		Message:             spatialMsg,
		ServerProcessTimeMs: elapsed,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleTelemetry(w http.ResponseWriter, r *http.Request) {
	var t models.DeviceTelemetry
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	s.metrics.RecordTelemetry(t)
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "recorded"})
}

func (s *Server) handleGetScene(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	items := s.spatial.GetActiveObjects()
	json.NewEncoder(w).Encode(items)
}

func (s *Server) handleClearScene(w http.ResponseWriter, r *http.Request) {
	s.spatial.ClearScene()
	s.metrics.ActivePlacements.Set(0)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cleared"})
}
