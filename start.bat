@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org or just open index.html directly.
  echo Opening index.html directly...
  start "" "%~dp0index.html"
  pause
  goto :eof
)
if exist node_modules\esbuild\package.json node tools\build.js
rem One copy only: if Clout is already running, do not start another server or open another tab.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Clout is already running at http://localhost:8080 - use the tab you already have. Nothing new was started.
  timeout /t 5 >nul
  goto :eof
)
start "" http://localhost:8080
node serve.js 8080
