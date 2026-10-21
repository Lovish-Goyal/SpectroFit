package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/spatial-mesh-ar/engine/pkg/models"
)

// Metrics holds the Prometheus collectors for AR offloading and spatial telemetry
type Metrics struct {
	OffloadDecisionsTotal *prometheus.CounterVec
	MotionToPhotonLatency *prometheus.HistogramVec
	ServerProcessDuration prometheus.Histogram
	DeviceBatteryLevel    *prometheus.GaugeVec
	DeviceCPULoad         *prometheus.GaugeVec
	NetworkRTT            *prometheus.GaugeVec
	ClientFPS             *prometheus.GaugeVec
	ActivePlacements      prometheus.Gauge
}

// NewMetrics initializes and registers spatial engine observability metrics with the default Prometheus registry
func NewMetrics() *Metrics {
	m := &Metrics{
		OffloadDecisionsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "ar_offload_decisions_total",
				Help: "Total count of offloading decisions partitioned by target, LOD, and reason",
			},
			[]string{"target", "recommended_lod", "reason"},
		),

		MotionToPhotonLatency: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "ar_motion_to_photon_latency_ms",
				Help:    "End-to-end Motion-to-Photon latency in milliseconds",
				Buckets: []float64{5.0, 10.0, 15.0, 20.0, 30.0, 45.0, 60.0, 100.0, 150.0, 250.0},
			},
			[]string{"target", "lod"},
		),

		ServerProcessDuration: promauto.NewHistogram(
			prometheus.HistogramOpts{
				Name:    "ar_server_process_duration_ms",
				Help:    "Time taken by the Golang spatial engine to validate placement and compute offload heuristics",
				Buckets: []float64{0.5, 1.0, 2.0, 3.5, 5.0, 10.0, 20.0},
			},
		),

		DeviceBatteryLevel: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "ar_device_battery_ratio",
				Help: "Real-time client device battery percentage (0.0 to 1.0)",
			},
			[]string{"device_id"},
		),

		DeviceCPULoad: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "ar_device_cpu_load_ratio",
				Help: "Real-time client device CPU utilization (0.0 to 1.0)",
			},
			[]string{"device_id"},
		),

		NetworkRTT: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "ar_device_network_rtt_ms",
				Help: "Network Round-Trip Time between client XR headset and edge cluster in ms",
			},
			[]string{"device_id"},
		),

		ClientFPS: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "ar_device_client_fps",
				Help: "Current rendering frame-rate of the WebXR client",
			},
			[]string{"device_id"},
		),

		ActivePlacements: promauto.NewGauge(
			prometheus.GaugeOpts{
				Name: "ar_active_placed_objects_count",
				Help: "Number of 3D objects currently active in the spatial scene",
			},
		),
	}

	return m
}

// RecordTelemetry updates gauges based on incoming telemetry packets
func (m *Metrics) RecordTelemetry(t models.DeviceTelemetry) {
	if t.DeviceID == "" {
		t.DeviceID = "default-xr-client"
	}
	m.DeviceBatteryLevel.WithLabelValues(t.DeviceID).Set(t.BatteryLevel)
	m.DeviceCPULoad.WithLabelValues(t.DeviceID).Set(t.ClientCPULoad)
	m.NetworkRTT.WithLabelValues(t.DeviceID).Set(t.NetworkRTTMs)
	m.ClientFPS.WithLabelValues(t.DeviceID).Set(t.ClientFPS)

	if t.MotionToPhotonLatency > 0 {
		m.MotionToPhotonLatency.WithLabelValues("CLIENT_LOCAL", "MEASURED").Observe(t.MotionToPhotonLatency)
	}
}

// RecordDecision logs an offload decision and predicted latency
func (m *Metrics) RecordDecision(decision models.OffloadDecision) {
	m.OffloadDecisionsTotal.WithLabelValues(
		string(decision.Target),
		decision.RecommendedLOD,
		decision.Reason,
	).Inc()

	m.MotionToPhotonLatency.WithLabelValues(
		string(decision.Target),
		decision.RecommendedLOD,
	).Observe(decision.PredictedLatencyMs)
}
