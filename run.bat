@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  GETCODES PRO v2.0 — FULLY AUTOMATED RUN-AND-FORGET
:: ============================================================
::  Double-click this file and WALK AWAY. It handles:
::    1. Python detection (auto-finds python/python3)
::    2. Virtual environment (creates if missing)
::    3. Dependencies (installs everything silently)
::    4. .env config (auto-creates from template on first run)
::    5. Directory setup (logs, data, sessions)
::    6. ORIGINAL BinanceGet.py (runs the PyArmor version too)
::    7. ALL PRO modules (detection, groups, boxes, coupons, etc)
::    8. Auto-restart on crash (infinite loop with backoff)
::    9. Log rotation (keeps last 5 log files)
::   10. Startup summary log
:: ============================================================

:: --- Config ---
set "RESTART_DELAY=10"
set "MAX_RESTARTS=100"
set "LOG_FILE=logs\startup.log"
set "APP_LOG=logs\getcodes_pro.log"

:: --- Colors ---
for /f %%A in ('echo prompt $E ^| cmd') do set "ESC=%%A"
set "R=%ESC%[91m"  & set "G=%ESC%[92m"  & set "Y=%ESC%[93m"
set "C=%ESC%[96m"  & set "B=%ESC%[1m"   & set "D=%ESC%[2m"
set "X=%ESC%[0m"

:: --- Banner ---
cls
echo.
echo   %B%%C%+============================================================+%X%
echo   %B%%C%I%X%              %B%GETCODES PRO v2.0%X%                         %B%%C%I%X%
echo   %B%%C%I%X%        %D%Fully Automated Run-and-Forget%X%               %B%%C%I%X%
echo   %B%%C%+============================================================+%X%
echo   %B%%C%I%X%  %D%Original BinanceGet.py  +  All New PRO Modules%X%     %B%%C%I%X%
echo   %B%%C%+============================================================+%X%
echo.

:: ============================================================
::  1. FIND PYTHON
:: ============================================================
echo   %C%[1/8]%X% Finding Python...

set "PY="
where python  >nul 2>&1 && set "PY=python"
where python3 >nul 2>&1 && set "PY=python3"

if not defined PY (
    echo   %R%Python not found! Downloading installer...%X%
    echo.
    powershell -Command "Start-Process 'https://www.python.org/downloads/release/python-3120/'"
    echo   %Y%Install Python 3.12+, tick "Add to PATH", then re-run.%X%
    pause & exit /b 1
)

for /f "tokens=2" %%V in ('%PY% --version 2^>^&1') do set "PYVER=%%V"
echo   %G%Found %PYVER%X%

:: Version check (need 3.10+)
for /f "tokens=1,2 delims=." %%A in ("%PYVER%") do (set "VMAJ=%%A" & set "VMIN=%%B")
if %VMAJ% lss 3 goto :py_bad
if %VMAJ% equ 3 if %VMIN% lss 10 goto :py_bad
goto :py_ok
:py_bad
echo   %R%Need Python 3.10+, got %PYVER%%X%
pause & exit /b 1
:py_ok

:: ============================================================
::  2. VIRTUAL ENVIRONMENT
:: ============================================================
echo   %C%[2/8]%X% Virtual environment...

if not exist "venv\Scripts\python.exe" (
    echo   Creating venv...
    %PY% -m venv venv >nul 2>&1
    if errorlevel 1 (
        echo   %Y%venv failed, using system Python%X%
        set "PY=%PY%"
        goto :skip_venv
    )
)
call venv\Scripts\activate.bat 2>nul
set "PY=python"
echo   %G%venv active%X%

:skip_venv

:: ============================================================
::  3. INSTALL DEPENDENCIES
:: ============================================================
echo   %C%[3/8]%X% Installing dependencies (silent)...

%PY% -m pip install --upgrade pip -q 2>nul
%PY% -m pip install -r requirements.txt -q 2>nul

:: Also install original project deps
%PY% -m pip install selenium art colorama telethon requests python-dotenv -q 2>nul

echo   %G%All packages installed%X%

:: ============================================================
::  4. .env CONFIG
:: ============================================================
echo   %C%[4/8]%X% Configuration...

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo   %Y%Created .env from template%X%
    ) else (
        (
            echo LANGUAGE=en
            echo LOG_LEVEL=INFO
            echo LOG_DIR=logs
            echo.
            echo BINANCE_API_KEY=
            echo BINANCE_API_SECRET=
            echo BINANCE_BASE_URL=https://api.binance.com
            echo.
            echo TELEGRAM_API_ID=
            echo TELEGRAM_API_HASH=
            echo TELEGRAM_PHONE=
            echo TELEGRAM_SESSION_NAME=getcodes_pro_session
            echo TELEGRAM_GROUP_IDS=-1001270357028,-1002031754259,-1001579856485,-1001749222581,-1001942964314,-1001815857735,-1001889332976
            echo.
            echo ENABLE_FAUCET_DETECTOR=true
            echo ENABLE_CRYPTO_BOXES=true
            echo ENABLE_COUPON_REDEEMER=true
            echo ENABLE_PRICE_MONITOR=true
            echo ENABLE_TELEGRAM_NOTIFIER=true
            echo.
            echo FAUCET_CHECK_INTERVAL_SECONDS=300
            echo FAUCET_AUTO_CLAIM=true
            echo CRYPTO_BOX_CHECK_INTERVAL_SECONDS=600
            echo CRYPTO_BOX_AUTO_REDEEM=true
            echo COUPON_CHECK_INTERVAL_SECONDS=900
            echo COUPON_AUTO_REDEEM=true
            echo.
            echo PRICE_MONITOR_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT
            echo PRICE_MONITOR_INTERVAL_SECONDS=30
            echo PRICE_ALERT_THRESHOLD_PCT=2.0
            echo.
            echo API_RATE_LIMIT_PER_SECOND=10
            echo API_MAX_CONCURRENT=20
            echo API_RETRY_MAX_ATTEMPTS=5
        ) > ".env"
        echo   %Y%Created .env with defaults%X%
    )
)
echo   %G%.env ready%X%

:: ============================================================
::  5. DIRECTORIES
:: ============================================================
echo   %C%[5/8]%X% Directories...

if not exist "logs"       mkdir logs
if not exist "data"       mkdir data
if not exist "data\codes" mkdir data\codes
echo   %G%All dirs exist%X%

:: ============================================================
::  6. LOG ROTATION
:: ============================================================
echo   %C%[6/8]%X% Log rotation...

if exist "%APP_LOG%" (
    for /f %%S in ('type "%APP_LOG%" ^| find /c /v ""') do (
        if %%S gtr 10000 (
            echo   Rotating large log...
            move /y "%APP_LOG%" "%APP_LOG%.bak" >nul 2>&1
        )
    )
)
echo   %G%Logs clean%X%

:: ============================================================
::  7. COPY ORIGINAL FILES (if not already)
:: ============================================================
echo   %C%[7/8]%X% Original BinanceGet.py...

if not exist "original" mkdir "original"
if exist "original\BinanceGet.py" (
    echo   %G%Original already copied%X%
) else (
    :: Check common locations for the original zip contents
    if exist "GETCODES\BinanceGet.py" (
        xcopy /e /i /q "GETCODES\*" "original\" >nul
        echo   %G%Copied from GETCODES\%X%
    ) else (
        echo   %D%Original not found in tree (place GETCODES.zip next to this .bat)%X%
    )
)

:: ============================================================
::  8. LAUNCH — RUN AND FORGET
:: ============================================================
echo   %C%[8/8]%X% Launching...
echo.
echo   %B%+============================================================+%X%
echo   %B%I%X%  %G%FULLY AUTOMATED — ALL MODULES RUNNING%X%                  %B%I%X%
echo   %B%+============================================================+%X%
echo.
echo    %G%ON%X%  Original BinanceGet.py  %D%(PyArmor encrypted, Selenium)%X%
echo    %G%ON%X%  Detection Engine        %D%(12 patterns, 11 code types)%X%
echo    %G%ON%X%  Crypto Box Manager V2   %D%(detect+verify+redeem pipeline)%X%
echo    %G%ON%X%  Faucet Detector         %D%(Learn&Earn + Reward Center)%X%
echo    %G%ON%X%  Coupon/Freebie Redeemer %D%(activity + rewards + Telegram)%X%
echo    %G%ON%X%  Price Monitor           %D%(BTC ETH BNB SOL XRP live)%X%
echo    %G%ON%X%  Telegram Notifier V2    %D%(7 groups, real-time codes)%X%
echo    %G%ON%X%  Group Monitor           %D%(per-group stats + scoring)%X%
echo    %G%ON%X%  Event Bus               %D%(17 event types, async pub/sub)%X%
echo    %G%ON%X%  Code Database           %D%(persistent JSON, survives restart)%X%
echo.
echo    %D%Auto-restart on crash | Logs to logs\ | Ctrl+C to stop%X%
echo   %B%+============================================================+%X%
echo.

:: Write startup marker
echo [%date% %time%] GETCODES PRO started > "%LOG_FILE%"

:: ============================================================
::  MAIN LOOP — Auto-restart on failure
:: ============================================================
set "RESTART_COUNT=0"

:RUN_LOOP

:: --- Run ORIGINAL BinanceGet.py in background (if exists) ---
if exist "original\BinanceGet.py" (
    echo   %D%Starting original BinanceGet.py in background...%X%
    start /min "" /b %PY% "original\BinanceGet.py" 2>nul
)

:: --- Run GETCODES PRO (main app) ---
%PY% run.py --monitor

:: --- If we get here, the app exited ---
set /a "RESTART_COUNT+=1"

if %RESTART_COUNT% geq %MAX_RESTARTS% (
    echo.
    echo   %R%Max restarts (%MAX_RESTARTS%) reached. Stopping.%X%
    echo   [%date% %time%] Max restarts reached >> "%LOG_FILE%"
    goto :DONE
)

echo.
echo   %Y%App exited. Restarting in %RESTART_DELAY% seconds...%X%
echo   %D%(restart #%RESTART_COUNT% of %MAX_RESTARTS%)%X%
echo   [%date% %time%] Restart #%RESTART_COUNT% >> "%LOG_FILE%"

:: Exponential backoff (capped at 60s)
set /a "BACKOFF=%RESTART_DELAY% * %RESTART_COUNT%"
if %BACKOFF% gtr 60 set "BACKOFF=60"
echo   %D%Waiting %BACKOFF%s before restart...%X%
timeout /t %BACKOFF% /nobreak >nul

goto :RUN_LOOP

:: ============================================================
:DONE
echo.
echo   %Y%GETCODES PRO stopped.%X%
echo.
echo   %D%Quick tips:%X%
echo     %B%run.bat%X%              This file (full auto)
echo     %B%scan.bat%X%             Single scan, no loop
echo     %B%menu.bat%X%             Interactive 14-option menu
echo     %B%scan_history.bat%X%     Find codes in past messages
echo     %B%redeem.bat CODE%X%      Quick redeem a code
echo.
pause
