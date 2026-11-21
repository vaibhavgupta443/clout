@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  goto :eof
)
if exist node_modules\esbuild\package.json node tools\build.js
rem An older Clout server still holding port 8080 would keep serving old code to the phone, so stop it first.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo.
echo Starting Clout in PHONE MODE (your home Wi-Fi only, PIN protected)...
echo If Windows asks about the firewall, choose "Private networks" and Allow.
echo.
start "" http://localhost:8080
node serve.js 8080 --lan
pause
