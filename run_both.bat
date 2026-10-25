@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  GETCODES PRO — Run BOTH original + new simultaneously
::  Two parallel processes:
::    1. Original BinanceGet.py (Selenium-based, PyArmor)
::    2. GETCODES PRO v2.0 (all new async modules)
:: ============================================================

echo.
echo   +============================================================+
echo   I           DUAL MODE — Original + PRO Simultaneously        I
echo   +============================================================+
echo.

:: Find Python
set "PY="
where python  >nul 2>&1 && set "PY=python"
where python3 >nul 2>&1 && set "PY=python3"

if not defined PY (
    echo   ERROR: Python not found!
    pause & exit /b 1
)

:: Activate venv
if exist "venv\Scripts\activate.bat" call venv\Scripts\activate.bat

:: Install all deps
echo   Installing all dependencies...
%PY% -m pip install --upgrade pip -q 2>nul
%PY% -m pip install -r requirements.txt -q 2>nul
%PY% -m pip install selenium art colorama telethon requests python-dotenv -q 2>nul

:: .env check
if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul
    echo   Created .env — edit it with your API keys!
    notepad ".env"
)

:: Dirs
if not exist "logs"       mkdir logs
if not exist "data\codes" mkdir data\codes

echo.
echo   %ESC%[92mStarting BOTH processes...%ESC%[0m
echo.
echo   [1] Original BinanceGet.py   (Selenium + Telegram scraper)
echo   [2] GETCODES PRO v2.0        (async detection + redeem + monitor)
echo.
echo   Both run in parallel. Close this window to stop both.
echo.

:: Start original in a new window
if exist "original\BinanceGet.py" (
    start "BinanceGet (Original)" /min cmd /c "cd /d %cd%\original && %PY% BinanceGet.py"
    echo   [1] Original started in background window
) else (
    echo   [1] Original NOT found (skipping)
)

:: Start PRO in a new window
start "GETCODES PRO v2.0" cmd /c "%PY% run.py --monitor"
echo   [2] PRO started in new window

echo.
echo   Both processes running in separate windows.
echo   Close those windows or press Ctrl+C here to stop.
echo.

:: Keep this script alive
:wait
timeout /t 60 /nobreak >nul
echo   [%date% %time%] Both processes still running...
goto :wait
