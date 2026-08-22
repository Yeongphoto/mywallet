@echo off
setlocal
title MyWallet Live D1 Dev Server

cd /d "%~dp0"
echo Starting MyWallet with the live Cloudflare D1 database...
echo Open http://127.0.0.1:5174 after the server is ready.
echo.

call npm run dev
