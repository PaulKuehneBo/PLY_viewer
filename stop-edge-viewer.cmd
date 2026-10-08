@echo off
setlocal EnableExtensions

set "PORT=4179"

echo Stopping any process listening on port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = %PORT%; $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {} } } }" >nul 2>&1

echo Server on port %PORT% is stopped if it was running.
exit /b 0
