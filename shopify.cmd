@echo off
cd /d "%~dp0"
node scripts\shopify-proxy.cjs %*
exit /b %ERRORLEVEL%
