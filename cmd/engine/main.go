package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spatial-mesh-ar/engine/internal/api"
	"github.com/spatial-mesh-ar/engine/internal/metrics"
	"github.com/spatial-mesh-ar/engine/internal/offloader"
	"github.com/spatial-mesh-ar/engine/internal/spatial"
)

func main() {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "30080"
	}

	log.Println("[INFO] Initializing Spatial AR Rendering & Compute Offloading Engine...")

	// 1. Initialize Prometheus telemetry registry
	m := metrics.NewMetrics()

	// 2. Initialize Offloading Decision Engine
	decisionEngine := offloader.NewDecisionEngine(offloader.DefaultConfig())

	// 3. Initialize Spatial Surface & Collision Validator
	spatialValidator := spatial.NewSpatialValidator()

	// 4. Initialize HTTP Server
	server := api.NewServer(decisionEngine, spatialValidator, m)

	httpServer := &http.Server{
		Addr:         ":" + port,
		Handler:      server,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  15 * time.Second,
	}

	// 5. Graceful shutdown handler
	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[INFO] Engine listening on :%s (Metrics at :%s/metrics)\n", port, port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] Server listener failed: %v\n", err)
		}
	}()

	<-shutdownSignal
	log.Println("[INFO] Received shutdown signal. Draining connections...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] Server forced to shutdown: %v\n", err)
	}

	fmt.Println("[INFO] Spatial engine exited cleanly.")
}
