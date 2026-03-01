@echo off
echo Setting environment variables for Wise route...
set FORCE_BANK_WIRE=true
set BANK_WIRE_ENABLE=true
set BANK_WIRE_PROVIDER=WISE
set WISE_ENABLE=true
set SWARM_LIVE=true

echo Environment variables set:
echo FORCE_BANK_WIRE: %FORCE_BANK_WIRE%
echo BANK_WIRE_ENABLE: %BANK_WIRE_ENABLE%
echo BANK_WIRE_PROVIDER: %BANK_WIRE_PROVIDER%
echo WISE_ENABLE: %WISE_ENABLE%
echo SWARM_LIVE: %SWARM_LIVE%

echo Running settlement health check with Wise route...
node reports/settlement_health_check_csv.js
echo.
echo Wise route settlement processing complete.
pause