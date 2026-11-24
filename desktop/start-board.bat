@echo off
cd /d "%~dp0"
if exist "ShopBoard.exe" (
  echo Starting Shop Board...
  "ShopBoard.exe"
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 20 LTS from https://nodejs.org, then run this file again.
  echo Or put ShopBoard.exe in this folder and double-click it instead.
  pause
  exit /b
)
node server.mjs
if errorlevel 1 pause
