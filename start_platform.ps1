# SpectroFit AR Platform Launcher
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting SpectroFit AR Platform & Spatial Engine          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($PSScriptRoot) {
    Set-Location -Path $PSScriptRoot
}

# Ensure Go in PATH if installed in standard location
if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\Go\bin\go.exe") {
        $env:PATH = "C:\Program Files\Go\bin;" + $env:PATH
    }
}

# Free port 30080 / kill old engine if still holding it
Stop-Process -Name engine -Force -ErrorAction SilentlyContinue
$oldConn = Get-NetTCPConnection -LocalPort 30080 -ErrorAction SilentlyContinue
if ($oldConn) {
    Write-Host "[Info] Cleaning up previous process on port 30080..." -ForegroundColor Yellow
    $oldPids = $oldConn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $oldPids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 600
}

# Check & Compile engine.exe if not present
if (-not (Test-Path ".\engine.exe")) {
    Write-Host "[Info] engine.exe not found. Compiling from Go source..." -ForegroundColor Cyan
    go build -o engine.exe ./cmd/engine
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[Error] Failed to build engine.exe. Please ensure Go is installed." -ForegroundColor Red
        pause
        exit 1
    }
}

# Automatically open browser to the platform
Start-Process "http://localhost:30080/"

Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host " SpectroFit Platform is LIVE at: http://localhost:30080/" -ForegroundColor Green
Write-Host " - Health Probe:       http://localhost:30080/healthz" -ForegroundColor Green
Write-Host " - Prometheus Metrics: http://localhost:30080/metrics" -ForegroundColor Green
Write-Host " - Assets API:         http://localhost:30080/api/v1/assets" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host " >>> Press Ctrl+C or close this window to STOP <<<" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Run engine directly in the foreground so Ctrl+C or closing window stops it immediately
$env:PORT = "30080"
.\engine.exe
