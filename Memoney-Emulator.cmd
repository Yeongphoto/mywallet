@echo off
setlocal
cd /d "%~dp0"
title Memoney Emulator
echo Checking Medium_Phone and connecting it to Orca...
echo Keep Orca open. A cold boot can take up to two minutes.
echo.
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js or check PATH.
  pause
  exit /b 1
)
node "%~dp0scripts\android-connect.mjs"
if errorlevel 1 (
  echo.
  echo Connection failed. Check the message above and keep Orca open.
  pause
  exit /b 1
)
echo.
echo Connected. The Memoney app is ready in Orca.
timeout /t 3 >nul 2>nul
exit /b 0
