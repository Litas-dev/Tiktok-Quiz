@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo Starting WS chat bridge...
node server.js ibuxas
echo.
echo Press Ctrl+C to stop. Window will stay open.
cmd /k
