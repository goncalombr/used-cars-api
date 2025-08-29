@echo off
set LOG="C:\Users\Gon?alo\used-cars\api\run-alerts.log"
echo [%date% %time%] Starting alerts run >> "%LOG%"
cd /d "C:\Users\Gon?alo\used-cars\api"
npm run alerts:once >> "%LOG%" 2>&1
echo [%date% %time%] ExitCode=%errorlevel% >> "%LOG%"

