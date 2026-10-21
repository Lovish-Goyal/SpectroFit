@echo off
title SpectroFit AR Platform
cd /d "%~dp0"

echo ==========================================================
echo   Starting SpectroFit AR Platform ^& Spatial Engine
echo ==========================================================

:: If Go is in standard location, add to PATH
if exist "C:\Program Files\Go\bin\go.exe" (
    set "PATH=C:\Program Files\Go\bin;%PATH%"
)

:: Free port 30080 / kill any old engine instance before starting
taskkill /F /IM engine.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :30080 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Compile engine if missing
if not exist "engine.exe" (
    echo [Info] engine.exe not found. Compiling from Go source...
    go build -o engine.exe ./cmd/engine
    if errorlevel 1 (
        echo [Error] Failed to compile engine.exe. Ensure Go is installed.
        pause
        exit /b 1
    )
)

:: Open browser automatically in background after 1 second
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:30080/"

echo.
echo ----------------------------------------------------------
echo   SpectroFit Platform is LIVE at: http://localhost:30080/
echo   - Health Check:  http://localhost:30080/healthz
echo   - Metrics:       http://localhost:30080/metrics
echo   - Assets API:    http://localhost:30080/api/v1/assets
echo ----------------------------------------------------------
echo   ^>^>^> Press Ctrl+C or close this window to STOP ^<^<^<
echo ==========================================================
echo.

set PORT=30080
engine.exe

:: Cleanup when stopped
taskkill /F /IM engine.exe >nul 2>&1
echo.
echo SpectroFit platform stopped.
