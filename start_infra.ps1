# start_infra.ps1
# This script starts the project's local Redis and Celery worker.

$REDIS_EXE = "$PSScriptRoot\bin\redis\redis-server.exe"

if (-not (Test-Path $REDIS_EXE)) {
    Write-Host "⚠️ Portable Redis binary not found at $REDIS_EXE." -ForegroundColor Red
    Write-Host "Trying to use system redis-server instead..." -ForegroundColor Cyan
    $REDIS_EXE = (Get-Command "redis-server" -ErrorAction SilentlyContinue).Source
}

if ($REDIS_EXE) {
    Write-Host "🚀 Starting Redis server from $REDIS_EXE..." -ForegroundColor Green
    Start-Process -FilePath $REDIS_EXE -NoNewWindow
} else {
    Write-Host "❌ Redis not found. Install it or run this script from the project root." -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Starting Celery worker..." -ForegroundColor Green
Set-Location -Path "api"
Start-Process -FilePath ".\venv\Scripts\python.exe" -ArgumentList "-m", "celery", "-A", "app.worker.celery_worker", "worker", "--loglevel=info", "--concurrency=1", "-P", "solo" -NoNewWindow
Write-Host "✅ Infrastructure started (Check terminal for Celery logs)." -ForegroundColor Green
