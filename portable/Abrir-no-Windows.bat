@echo off
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node server.mjs
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 server.py
  ) else (
    echo Instale Node.js 18 ou superior pelo site https://nodejs.org/ e abra novamente.
    pause
  )
)
