@echo off
cd /d "%~dp0"
node tools/make-site.js
echo.
echo Upload the "site" folder to your host. Phones update themselves next time they open the app.
pause
