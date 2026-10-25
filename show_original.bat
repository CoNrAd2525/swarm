@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
::  GETCODES PRO — Show Original Code Info
:: ============================================================

echo.
echo   +============================================================+
echo   I               Original Code Analysis                        I
echo   +============================================================+
echo.
echo   FILE: BinanceGet.py (86,327 bytes)
echo   ENCRYPTION: PyArmor 8.5.11 (trial license)
echo   CREATED: 2024-09-24T14:28:25
echo   LICENSE TYPE: non-profits, ID 000000
echo   PLATFORM: Windows x86-64 (pyarmor_runtime.pyd = PE32+ DLL)
echo.
echo   +------------------------------------------------------------+
echo   I                  Source Code Structure                     I
echo   +------------------------------------------------------------+
echo.
echo   BinanceGet.py          [ENCRYPTED - 86KB binary blob]
echo     |
echo     +-- from dist.pyarmor_runtime_000000 import __pyarmor__
echo     +-- __pyarmor__(__name__, __file__, b'PY000000...')
echo     |
echo     +-- [Decrypts at runtime via pyarmor_runtime.pyd]
echo         |
echo         +-- Selenium browser automation
echo         |     (headless Chrome/Firefox, Binance web)
echo         +-- Telethon Telegram client
echo         |     (monitors 7 groups for codes)
echo         +-- Requests HTTP client
echo         |     (Binance REST API calls)
echo         +-- Colorama terminal colors
echo         +-- Art ASCII banner
echo         +-- python-dotenv config
echo.
echo   +------------------------------------------------------------+
echo   I                  Dependencies (from requirements.txt)      I
echo   +------------------------------------------------------------+
echo.
echo   Package         Purpose
echo   -------         -------
echo   selenium        Browser automation - scrapes Binance web
echo   art             ASCII art banner display
echo   colorama        Cross-platform colored terminal text
echo   telethon        Telegram MTProto client - reads/sends msgs
echo   datetime        Time/date handling
echo   requests        HTTP requests - Binance REST API
echo   pyarmor         Code obfuscation/encryption
echo   python-dotenv   .env file configuration
echo.
echo   +------------------------------------------------------------+
echo   I                  Telegram Groups (from groups.txt)         I
echo   +------------------------------------------------------------+
echo.
echo   -1001270357028
echo   -1002031754259
echo   -1001579856485
echo   -1001749222581
echo   -1001942964314
echo   -1001815857735
echo   -1001889332976
echo.
echo   +------------------------------------------------------------+
echo   I                  Inferred Behavior                         I
echo   +------------------------------------------------------------+
echo.
echo   Based on the dependency analysis:
echo.
echo   1. LAUNCHES a Selenium browser (likely headless)
echo      - Navigates to Binance.com
echo      - Scrapes crypto box / gift card pages
echo      - Detects and claims available rewards
echo      - Possibly handles login/2FA
echo.
echo   2. CONNECTS to Telegram via Telethon
echo      - Reads messages from the 7 groups above
echo      - Extracts gift card / crypto box codes from messages
echo      - May auto-redeem detected codes via Binance API
echo      - Sends status/alert messages back to groups
echo.
echo   3. CALLS Binance REST API via Requests
echo      - Verifies gift card codes (GET /sapi/v1/giftcard/verify)
echo      - Redeems valid codes (POST /sapi/v1/giftcard/redeemCode)
echo      - Checks account balance and reward status
echo.
echo   4. DISPLAYS colored output via Colorama + Art
echo      - ASCII art banner on startup
echo      - Color-coded status messages
echo      - Progress indicators
echo.
echo   +------------------------------------------------------------+
echo   I                  What GETCODES PRO Improves                I
echo   +------------------------------------------------------------+
echo.
echo   Original              GETCODES PRO v2.0
echo   --------              ----------------
echo   Selenium (slow)       Async aiohttp (10x faster)
echo   Single-threaded       Full async (concurrent modules)
echo   Basic code matching   12-pattern detection engine
echo   No code types         11 classified code types
echo   No persistence        JSON database (survives restart)
echo   No events             17-type async event bus
echo   No group stats        Per-group monitoring + scoring
echo   No history scanning   Retroactive past-message scan
echo   No Chinese support    Bilingual (EN + CN) keywords
echo   No rate limiting      Token bucket + semaphore
echo   No retry logic        Exponential backoff retry
echo   No Docker             Full Docker + docker-compose
echo   No health checks      HTTP /health endpoint
echo   No auto-restart       Crash recovery with backoff
echo   Windows only          Cross-platform (Linux/Mac/Win)
echo.
echo   +============================================================+
echo.
pause
