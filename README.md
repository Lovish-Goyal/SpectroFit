# SpectroFit 👓✨
> **Cloud-Native Spatial AR Virtual Try-On & Dynamic Compute Offloading Platform**  
> *Production-Grade Spatial Computing & WebXR Virtual Try-On Architecture*

---

[![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8?style=for-the-badge&logo=go)](https://golang.org)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black?style=for-the-badge&logo=three.js)](https://threejs.org)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-FaceMesh%20%26%20Hands-0078D7?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Kind%20Cluster-326CE5?style=for-the-badge&logo=kubernetes)](https://kubernetes.io)
[![Prometheus](https://img.shields.io/badge/Prometheus-Telemetry-E6522C?style=for-the-badge&logo=prometheus)](https://prometheus.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## 📌 1. Project Overview

**SpectroFit** is an enterprise-grade Augmented Reality (AR) spatial computing framework designed for **Real-Time 3D Virtual Try-On (VTO)** and **Dynamic Client-to-Edge Compute Offloading**.

### 🔬 The Core Problem (AR Bottlenecks):
1. **Compute & Thermal Throttling**: Rendering dense 3D polygon meshes on mobile/headset GPUs causes battery drain and thermal throttling within 45–60 minutes.
2. **Motion-to-Photon (M2P) Latency**: To prevent visual lag and motion sickness, latency between user head motion and virtual asset updates must remain strictly under **20ms–30ms**.

### 💡 The SpectroFit Solution:
- **Heuristic Offloading Decision Engine (Golang)**: Monitors real-time client telemetry (FPS, frame time, battery, CPU, network RTT).
- **Sub-2ms Local Execution**: Lightweight tasks and stable telemetry are processed directly in the client's WebXR loop.
- **Dynamic Kubernetes Edge Offloading**: If local resources choke, heavy geometric calculations (collision checks, mesh decimation, spatial validation) are offloaded to an edge Kubernetes cluster.
- **Graceful Level-of-Detail (LOD) Fallback**: If network jitter spikes, the engine degrades polygon detail locally to guarantee smooth 60 FPS continuity.

---

## 🌟 Key Features

* **Real-Time Live Camera Virtual Try-On (VTO)**:
  - High-precision 468-point **MediaPipe FaceMesh** tracking.
  - Accurate anatomical temple-to-ear hang alignment and nose bridge positioning for eyewear.
  - Custom anatomical **occlusion buffer** for natural ear-back framing.
  - Real-time 6-DoF head pose estimation (Yaw, Pitch, Roll) and dynamic Pupillary Distance (PD) calculation.
* **Interactive 3D Studio Mode**:
  - Full 360° orbital rotation, inspectable material shaders, realistic PBR reflections, and dimension inspection.
  - Realistic 3D human mannequin bust reference for studio eyewear fitting.
* **Two Core Spatial AR Domains**:
  - 👓 **Glasses & Eyewear**: Aviator, Wayfarer, Round Wire, Browline Clubmaster, Matte Black, Sport Shield, Rectangular, Oakley Sport, Cyber Visor.
  - 🛋 **Room Furniture & Decor**: Antique Executive Desk, Nordic Windsor Chair, Office Chair, Utility Folding Table, Dining Suite & Chairs, Luxury Leather Sofa, Minimalist Coffee Table with drag-and-drop floor plane alignment and floor snapping.
* **Cloud-Native Microservices Architecture**:
  - Ultra-lightweight Golang backend engine (< 15MB RAM footprint).
  - Production-ready Docker & Kubernetes manifests (`kind-cluster-config.yaml`).
  - Native **Prometheus** scrape metrics (`/metrics`).

---

## 🏗 System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                 CLIENT VIEWPORT                                   |
|   WebXR / Three.js Frontend (Port 30000 / 30080)                                  |
|   - MediaPipe FaceMesh (468 facial landmarks)                                     |
|   - Real-Time Pose Estimator & Anatomical Ear Occlusion Buffer                    |
|   - Telemetry Emitter (FPS, Frame Drop %, Battery, Network RTT)                   |
+-----------------------------------------------------------------------------------+
                                        |
                 [ Telemetry / Offloading Decision Stream ]
                                        v
+-----------------------------------------------------------------------------------+
|                         GOLANG EDGE COMPUTING ENGINE                              |
|   Host / Container Port 30080                                                     |
|   - Heuristic Decision Engine (Client vs Edge Routing)                            |
|   - 3D Spatial Collision Validator & Polygon Decimator                            |
|   - Asset Catalog Service (/api/v1/assets)                                        |
|   - Prometheus Telemetry Registry (/metrics)                                      |
+-----------------------------------------------------------------------------------+
                                        |
                         [ Optional Edge Cluster Mesh ]
                                        v
+-----------------------------------------------------------------------------------+
|               KUBERNETES EDGE CLUSTER (Kind: spectrofit-cluster)                  |
|   - Pod: engine-deployment (Go Engine Service)                                    |
|   - Pod: frontend-deployment (Static Assets)                                      |
|   - Prometheus Scraper & HPA (Horizontal Pod Autoscaler)                          |
+-----------------------------------------------------------------------------------+
```

---

## 📁 Repository Structure

```text
SpectroFit/
├── cmd/
│   └── engine/
│       └── main.go               # Go Backend Entry Point
├── internal/
│   ├── api/
│   │   └── handler.go            # REST API, Health Probes, Static File Server
│   ├── metrics/
│   │   └── prometheus.go         # Prometheus Telemetry Collector
│   ├── offloader/
│   │   ├── heuristic.go          # Decision Offloading Algorithm
│   │   └── heuristic_test.go     # Unit Tests for Offloader
│   └── spatial/
│       ├── validator.go          # 3D Bounding Box & Collision Logic
│       └── validator_test.go     # Spatial Geometry Tests
├── pkg/
│   └── models/
│       └── types.go              # Shared Data Contracts & Structs
├── web/
│   ├── index.html                # Main SpectroFit Studio & AR Viewport
│   ├── app.js                    # Three.js Graphics Controller & UI Manager
│   ├── style.css                 # Enterprise Glassmorphic Stylesheet
│   ├── vto/                      # Virtual Try-On Pipeline Modules
│   │   ├── faceTracker.js        # MediaPipe FaceMesh & Camera Stream
│   │   ├── fitter.js             # Eyewear Anatomical Math & Ear Hang
│   │   ├── occlusion.js          # Anatomical Depth Occlusion Mask
│   │   └── poseEstimator.js      # Head Yaw/Pitch/Roll Estimation
│   └── models/                   # 3D Assets (.glb / .gltf)
├── k8s/                          # Kubernetes Manifests & Kind Cluster Config
├── Dockerfile                    # Container definition for Go Engine
├── Dockerfile.frontend           # Container definition for WebXR Frontend
├── go.mod / go.sum               # Go Module Dependencies
├── start_platform.bat            # 1-Click Windows Launcher
├── start_platform.ps1            # Automated PowerShell Bootstrap Script
└── README.md                     # Project Documentation
```

---

## 💻 Setup Guide for a New Laptop

Follow these simple instructions to set up and run SpectroFit on any fresh Windows, macOS, or Linux machine.

### 📋 Prerequisites

Before starting, install the following free software on your laptop:

1. **[Git](https://git-scm.com/downloads)**: To clone the repository.
2. **[Go (Golang)](https://go.dev/dl/)** *(Version 1.21 or higher)*: To compile and run the backend engine.
3. **[Python 3](https://www.python.org/downloads/)** *(or Node.js)*: Used as a lightweight local web server.
   > *Note: During Python installation on Windows, make sure to check **"Add Python to PATH"**.*
4. **Google Chrome / Microsoft Edge / Brave**: With camera permissions enabled for Live AR.

*(Optional for Kubernetes testing)*: [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Kind](https://kind.sigs.k8s.io/).

---

### 🚀 Quick Start (Running the Project)

#### 🪟 Method 1: One-Click Launch (Windows - Recommended)

1. Clone or download this repository to your laptop.
2. Double-click the file:
   ```cmd
   start_platform.bat
   ```
3. That's it! The script will automatically:
   - Check and build `engine.exe` if not present.
   - Start the Golang backend on port `30080`.
   - Start the web server on port `30000`.
   - Automatically open your default browser to `http://localhost:30000/`.

---

#### 🐧 Method 2: Manual Terminal Launch (Windows / Mac / Linux)

Open two terminal windows in the project root directory:

**Terminal 1: Start Go Backend Engine**
```bash
# Windows
go run ./cmd/engine/main.go

# macOS / Linux
PORT=30080 go run ./cmd/engine/main.go
```
*Backend will start on `http://localhost:30080` (Health: `http://localhost:30080/healthz`).*

**Terminal 2: Start WebXR Frontend**
```bash
# Using Python
python -m http.server 30000 --directory web

# OR using Node.js (if you have npx)
npx serve web -p 30000
```

Now open your web browser and navigate to:
👉 **`http://localhost:30000/`** (or directly via the engine at `http://localhost:30080/`)

---

## 🌐 Platform URLs & Verification

| Service | URL | Purpose |
| :--- | :--- | :--- |
| **SpectroFit Web Studio** | `http://localhost:30000/` | Main 3D Studio & Live Camera AR VTO |
| **Engine Direct Interface** | `http://localhost:30080/` | Engine static frontend & API root |
| **Cluster Health Probe** | `http://localhost:30080/healthz` | Kubernetes Liveness & Readiness check |
| **Prometheus Telemetry** | `http://localhost:30080/metrics` | Real-time FPS, latency, and node metrics |
| **Asset Catalog API** | `http://localhost:30080/api/v1/assets` | JSON metadata for all 3D models |

---

## 🚢 Publishing to GitHub

To push this project to your GitHub profile smoothly:

1. **Initialize Git & Stage Files**:
   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "feat: initial commit for SpectroFit platform"
   ```

2. **Link to your GitHub Repository**:
   *(Create a new empty repository named `SpectroFit` on GitHub first)*
   ```bash
   git remote add origin https://github.com/<YOUR-USERNAME>/SpectroFit.git
   ```

3. **Push Code**:
   ```bash
   git push -u origin main
   ```

*(Note: `.gitignore` is already pre-configured to exclude large temporary folders like `node_modules/`, `scratch/` test dumps, and binaries).*

---

## 🛠 Troubleshooting & FAQs

* **Camera not opening in Live AR Mode?**
  - Make sure you grant browser camera permissions when prompted.
  - If using Chrome, ensure camera access is enabled under `Settings > Privacy and security > Site settings > Camera`.
* **Port 30080 or 30000 is already in use?**
  - Open PowerShell as Administrator and run:
    ```powershell
    Get-NetTCPConnection -LocalPort 30080,30000 | Stop-Process -Id {$_.OwningProcess}
    ```
* **Want to test dynamic compute offloading?**
  - Switch models in rapid succession or throttle your CPU in Chrome DevTools (`Performance > CPU Throttling`). Watch the Prometheus metrics endpoint (`/metrics`) dynamically record offload decisions!

---

## 📜 License
This project is licensed under the MIT License.
