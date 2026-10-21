package offloader

import (
	"testing"
	"time"

	"github.com/spatial-mesh-ar/engine/pkg/models"
)

func TestDecisionEngine_OffloadingRules(t *testing.T) {
	engine := NewDecisionEngine(DefaultConfig())

	lowPolyAsset := models.ARAsset{
		ID:           "asset-chair-01",
		PolygonCount: 1200,
	}

	highPolyAsset := models.ARAsset{
		ID:           "asset-sofa-hq",
		PolygonCount: 85000,
	}

	t.Run("Rule A: Severe Network RTT forces Local Execution with Degraded LOD", func(t *testing.T) {
		telemetry := models.DeviceTelemetry{
			DeviceID:      "device-01",
			Timestamp:     time.Now(),
			NetworkRTTMs:  180.0, // High ping (cellular cell boundary or congested WiFi)
			ClientCPULoad: 0.90,  // Even with high CPU, cannot offload over 180ms link!
			ClientFPS:     30.0,
		}

		decision := engine.Evaluate(highPolyAsset, telemetry)
		if decision.Target != models.TargetClientLocal {
			t.Errorf("Expected CLIENT_LOCAL due to severe RTT, got %s", decision.Target)
		}
		if decision.RecommendedLOD != "LOW" {
			t.Errorf("Expected degraded LOD LOW, got %s", decision.RecommendedLOD)
		}
	})

	t.Run("Rule B: Critical Battery triggers Edge Offloading", func(t *testing.T) {
		telemetry := models.DeviceTelemetry{
			DeviceID:      "device-01",
			Timestamp:     time.Now(),
			BatteryLevel:  0.12, // 12% Battery
			NetworkRTTMs:  22.0, // Healthy 5G/WiFi edge link
			ClientCPULoad: 0.30,
			ClientFPS:     60.0,
		}

		decision := engine.Evaluate(lowPolyAsset, telemetry)
		if decision.Target != models.TargetEdgeCloud {
			t.Errorf("Expected EDGE_CLOUD to conserve power, got %s", decision.Target)
		}
	})

	t.Run("Rule C: High CPU load triggers Edge Offloading", func(t *testing.T) {
		telemetry := models.DeviceTelemetry{
			DeviceID:      "device-01",
			Timestamp:     time.Now(),
			BatteryLevel:  0.85,
			NetworkRTTMs:  20.0,
			ClientCPULoad: 0.88, // 88% CPU load
			ClientFPS:     40.0,
		}

		decision := engine.Evaluate(lowPolyAsset, telemetry)
		if decision.Target != models.TargetEdgeCloud {
			t.Errorf("Expected EDGE_CLOUD under CPU pressure, got %s", decision.Target)
		}
	})

	t.Run("Rule D: High-poly asset offloads when Edge is faster", func(t *testing.T) {
		telemetry := models.DeviceTelemetry{
			DeviceID:      "device-01",
			Timestamp:     time.Now(),
			BatteryLevel:  0.90,
			NetworkRTTMs:  15.0,
			ClientCPULoad: 0.40,
			ClientFPS:     60.0,
		}

		decision := engine.Evaluate(highPolyAsset, telemetry)
		if decision.Target != models.TargetEdgeCloud {
			t.Errorf("Expected EDGE_CLOUD for heavy 85k poly model, got %s", decision.Target)
		}
	})

	t.Run("Rule E: Low-poly asset with healthy client executes locally", func(t *testing.T) {
		telemetry := models.DeviceTelemetry{
			DeviceID:      "device-01",
			Timestamp:     time.Now(),
			BatteryLevel:  0.95,
			NetworkRTTMs:  30.0,
			ClientCPULoad: 0.20,
			ClientFPS:     60.0,
		}

		decision := engine.Evaluate(lowPolyAsset, telemetry)
		if decision.Target != models.TargetClientLocal {
			t.Errorf("Expected CLIENT_LOCAL for lightweight model, got %s", decision.Target)
		}
		if decision.RecommendedLOD != "HIGH" {
			t.Errorf("Expected HIGH LOD, got %s", decision.RecommendedLOD)
		}
	})
}
