@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH. Install Node.js and npm first.
  pause
  exit /b 1
)

if not exist "node_modules\typescript\bin\tsc" (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 goto failed
)

echo Building and packaging the Posed Camera extension...
call npx --yes @vscode/vsce package --no-yarn --allow-missing-repository --skip-license --out "%~dp0posed-camera.vsix"
if errorlevel 1 goto failed

echo.
echo VSIX created: %~dp0posed-camera.vsix
echo Install it in VS Code with: code --install-extension "%~dp0posed-camera.vsix"
pause
exit /b 0

:failed
echo.
echo Extension build or packaging failed.
pause
exit /b 1
