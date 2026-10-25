@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
::  GETCODES PRO — Run ORIGINAL BinanceGet.py
::  (The PyArmor-encrypted Selenium + Telethon script)
:: ============================================================

echo.
echo   +----------------------------------------------+
echo   I   Original BinanceGet.py (PyArmor 8.5.11)   I
echo   I   Selenium + Telethon + Requests + Colorama  I
echo   +----------------------------------------------+
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

:: Install original deps
echo   Installing original dependencies...
%PY% -m pip install selenium art colorama telethon requests python-dotenv -q 2>nul

:: Check original script exists
if not exist "original\BinanceGet.py" (
    echo.
    echo   ERROR: original\BinanceGet.py not found!
    echo.
    echo   Place the GETCODES.zip contents in the original\ folder.
    echo   The structure should be:
    echo     original\BinanceGet.py
    echo     original\dist\pyarmor_runtime_000000\
    echo     original\data\
    echo     original\source\
    echo.
    pause & exit /b 1
)

echo.
echo   === Original Code Info ===
echo.
echo   File:     BinanceGet.py
echo   Size:     86KB (PyArmor encrypted)
echo   Encrypted: 2024-09-24 by PyArmor 8.5.11 (trial)
echo   License:  non-profits, 000000
echo.
echo   Detected capabilities (from dependencies):
echo     - selenium       = Browser automation (Binance web scraping)
echo     - telethon       = Telegram client (*7 groups in source/groups.txt)
echo     - requests       = HTTP API calls (Binance REST API)
echo     - colorama       = Colored terminal output
echo     - art            = ASCII art banner
echo     - python-dotenv  = Environment config
echo.
echo   Telegram groups monitored:
echo     -1001270357028
echo     -1002031754259
echo     -1001579856485
echo     -1001749222581
echo     -1001942964314
echo     -1001815857735
echo     -1001889332976
echo.
echo   === Source Code ===
echo.
echo   [ENCRYPTED] The Python source is locked inside PyArmor.
echo   Only the runtime (pyarmor_runtime.pyd) can decrypt it.
echo   The code runs on Windows only (pyarmor_runtime.pyd = PE32+ DLL).
echo.
echo   Starting original script...
echo.

:: Run from original directory so PyArmor runtime is found
pushd original
%PY% BinanceGet.py
popd

echo.
pause
