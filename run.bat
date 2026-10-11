@echo off
cd /d "%~dp0" || exit /b 1
where node >nul 2>nul || (echo Install Node.js 24 first. & exit /b 1)
call npm ci || exit /b 1
call npm run db:migrate || exit /b 1
call npm run build || exit /b 1
call npm start
