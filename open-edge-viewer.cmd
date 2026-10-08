@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=4179"
set "URL=http://127.0.0.1:%PORT%/webgl-harness.html"

if not exist "%~dp0\webgl-harness.html" (
  echo webgl-harness.html not found in %~dp0
  exit /b 1
)

echo Cleaning stale listeners on port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = %PORT%; $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {} } }" >nul 2>&1

where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python was not found in PATH. Please activate your Python environment first.
    exit /b 1
  )
  for /f "delims=" %%I in ('where py 2^>nul') do set "PYTHON_EXE=%%I"
) else (
  for /f "delims=" %%I in ('where python 2^>nul') do set "PYTHON_EXE=%%I"
)

echo Starting local HTTP server...
start "" /B "%PYTHON_EXE%" -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0" > "%TEMP%\posed-camera-http.log" 2>&1

echo Waiting for the web viewer to become ready...
set "READY=0"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } } catch { } exit 1" >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto ready
  )
  ping -n 2 127.0.0.1 >nul
)

:ready
if "%READY%"=="0" (
  echo HTTP server did not become ready in time: %URL%
  exit /b 1
)

echo Opening Edge with the harness page...
where msedge >nul 2>nul
if errorlevel 1 (
  start "" "%URL%"
) else (
  start "" msedge "%URL%"
)

echo Ready: %URL%
exit /b 0
