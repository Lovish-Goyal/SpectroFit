package offloader

import (
	"fmt"
	"time"

	"github.com/spatial-mesh-ar/engine/pkg/models"
)

// HeuristicConfig holds tunable parameters for the offloading decision matrix
type HeuristicConfig struct {
	MaxAcceptableRTTMs      float64 // Threshold above which edge offloading degrades M2P latency (e.g., 60ms)
	SevereRTTThresholdMs    float64 // Extreme lag threshold where local degraded rendering is forced (e.g., 100ms)
	BatteryCriticalLevel    float64 // Battery % below which client offloads aggressively (e.g., 0.20 for 20%)
	HighCPULoadThreshold    float64 // Client CPU threshold (e.g., 0.75 for 75%)
	LowFPSThreshold         float64 // Minimum acceptable client FPS (e.g., 45.0 FPS)
	BaseEdgeComputeMs       float64 // Average server-side spatial placement processing time (e.g., 3.5ms)
	LocalProcessingPolyRate float64 // Polygons per millisecond rendered locally by client GPU/CPU baseline
}

// DefaultConfig provides an industry-calibrated baseline configuration for mobile AR clients
func DefaultConfig() HeuristicConfig {
	return HeuristicConfig{
		MaxAcceptableRTTMs:      60.0,
		SevereRTTThresholdMs:    100.0,
		BatteryCriticalLevel:    0.20,
		HighCPULoadThreshold:    0.75,
		LowFPSThreshold:         45.0,
		BaseEdgeComputeMs:       3.5,
		LocalProcessingPolyRate: 1500.0, // ~1500 polygons/ms on mid-tier mobile GPU
	}
}

// DecisionEngine computes the optimal execution target and visual fidelity
type DecisionEngine struct {
	config HeuristicConfig
}

// NewDecisionEngine initializes the offloading heuristic engine
func NewDecisionEngine(cfg HeuristicConfig) *DecisionEngine {
	return &DecisionEngine{config: cfg}
}

// Evaluate computes the real-time offloading decision based on spatial asset weight and client telemetry
func (e *DecisionEngine) Evaluate(asset models.ARAsset, t models.DeviceTelemetry) models.OffloadDecision {
	now := time.Now().UTC()

	// 1. Calculate Estimated Local Compute/Rendering Latency
	// Available client capacity is constrained by current CPU load
	availableCapacity := 1.0 - t.ClientCPULoad
	if availableCapacity < 0.10 {
		availableCapacity = 0.10 // prevent division by zero or negative capacity
	}
	effectivePolyRate := e.config.LocalProcessingPolyRate * availableCapacity
	estimatedLocalLatencyMs := float64(asset.PolygonCount) / effectivePolyRate

	// Add penalty if FPS is already dropping below target
	if t.ClientFPS > 0 && t.ClientFPS < e.config.LowFPSThreshold {
		fpsPenaltyFactor := e.config.LowFPSThreshold / t.ClientFPS
		estimatedLocalLatencyMs *= fpsPenaltyFactor
	}

	// 2. Calculate Estimated Edge Compute Latency
	// Network Round-Trip Time + Edge processing + compression stream overhead (~2ms)
	estimatedEdgeLatencyMs := t.NetworkRTTMs + e.config.BaseEdgeComputeMs + 2.0

	// 3. Heuristic Decision Matrix:
	// Rule A: Network is severely degraded (RTT > 100ms) -> Must stay local, but downscale LOD if overloaded
	if t.NetworkRTTMs >= e.config.SevereRTTThresholdMs {
		recommendedLOD := "LOW"
		if estimatedLocalLatencyMs < 16.6 { // 16.6ms = 60 FPS frame budget
			recommendedLOD = "MEDIUM"
		}
		return models.OffloadDecision{
			AssetID:            asset.ID,
			Target:             models.TargetClientLocal,
			RecommendedLOD:     recommendedLOD,
			PredictedLatencyMs: estimatedLocalLatencyMs,
			Reason:             fmt.Sprintf("NETWORK_SEVERELY_DEGRADED (RTT=%.1fms >= %.1fms) -> FORCED_LOCAL_DEGRADED_LOD", t.NetworkRTTMs, e.config.SevereRTTThresholdMs),
			EvaluatedAt:        now,
		}
	}

	// Rule B: Battery is critically low (< 20%) AND Network RTT is acceptable (< 60ms) -> Offload to Edge
	if t.BatteryLevel > 0 && t.BatteryLevel <= e.config.BatteryCriticalLevel && t.NetworkRTTMs <= e.config.MaxAcceptableRTTMs {
		return models.OffloadDecision{
			AssetID:            asset.ID,
			Target:             models.TargetEdgeCloud,
			RecommendedLOD:     "HIGH",
			PredictedLatencyMs: estimatedEdgeLatencyMs,
			Reason:             fmt.Sprintf("BATTERY_CRITICAL (%.0f%% <= %.0f%%) -> OFFLOAD_EDGE_TO_CONSERVE_POWER", t.BatteryLevel*100, e.config.BatteryCriticalLevel*100),
			EvaluatedAt:        now,
		}
	}

	// Rule C: High Client CPU Load OR Frame Drops below threshold -> Offload to Edge if RTT acceptable
	if (t.ClientCPULoad >= e.config.HighCPULoadThreshold || (t.ClientFPS > 0 && t.ClientFPS < e.config.LowFPSThreshold)) && t.NetworkRTTMs <= e.config.MaxAcceptableRTTMs {
		return models.OffloadDecision{
			AssetID:            asset.ID,
			Target:             models.TargetEdgeCloud,
			RecommendedLOD:     "HIGH",
			PredictedLatencyMs: estimatedEdgeLatencyMs,
			Reason:             fmt.Sprintf("CLIENT_RESOURCE_PRESSURE (CPU=%.0f%%, FPS=%.1f) -> OFFLOAD_EDGE_MAINTAIN_60FPS", t.ClientCPULoad*100, t.ClientFPS),
			EvaluatedAt:        now,
		}
	}

	// Rule D: Heavy 3D Asset (High polygon count) where Edge Latency < Local Latency
	if estimatedEdgeLatencyMs < estimatedLocalLatencyMs && t.NetworkRTTMs <= e.config.MaxAcceptableRTTMs {
		return models.OffloadDecision{
			AssetID:            asset.ID,
			Target:             models.TargetEdgeCloud,
			RecommendedLOD:     "HIGH",
			PredictedLatencyMs: estimatedEdgeLatencyMs,
			Reason:             fmt.Sprintf("HIGH_POLYGON_ASSET (%d polys): Edge (%.1fms) beats Local (%.1fms)", asset.PolygonCount, estimatedEdgeLatencyMs, estimatedLocalLatencyMs),
			EvaluatedAt:        now,
		}
	}

	// Rule E: Default Optimal Path -> Execute Client Local with full or balanced fidelity
	selectedLOD := "HIGH"
	if estimatedLocalLatencyMs > 20.0 {
		selectedLOD = "MEDIUM"
	}

	return models.OffloadDecision{
		AssetID:            asset.ID,
		Target:             models.TargetClientLocal,
		RecommendedLOD:     selectedLOD,
		PredictedLatencyMs: estimatedLocalLatencyMs,
		Reason:             "OPTIMAL_LOCAL_CLIENT_RESOURCES_HEALTHY",
		EvaluatedAt:        now,
	}
}
