@echo off
setlocal enableextensions

REM ============================================================
REM  Veridian Windows launcher (Edge WebView2 app-mode)
REM  - Starts the Veridian dev server if port 3000 is idle
REM  - Opens a chromeless Edge --app window pointed at it
REM ============================================================

set "VERIDIAN_DIR=C:\Users\HI\veridian"
set "APP_URL=http://localhost:3000"
set "EDGE_PROFILE=%LOCALAPPDATA%\VeridianApp"

REM --- App-specific environment for the server ---
set "VERIDIAN_WATCH_DIR=%VERIDIAN_DIR%"
set "TELEMETRY_POLL_MS=30000"

REM --- Is the server already listening on port 3000? ---
set "RUNNING="
for /f "tokens=*" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":3000 .*LISTENING"') do set "RUNNING=1"

if defined RUNNING (
    echo [Veridian] Server already running on port 3000.
) else (
    echo [Veridian] Starting Veridian server...
    REM Launch the dev server minimized/hidden in its own window.
    start "Veridian Server" /min cmd /c "cd /d "%VERIDIAN_DIR%" && set VERIDIAN_WATCH_DIR=%VERIDIAN_WATCH_DIR%&& set TELEMETRY_POLL_MS=%TELEMETRY_POLL_MS%&& npm run dev"

    REM --- Wait (up to ~30s) for the port to come up ---
    echo [Veridian] Waiting for server to listen on port 3000...
    set "READY="
    for /l %%I in (1,1,30) do (
        if not defined READY (
            for /f "tokens=*" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":3000 .*LISTENING"') do set "READY=1"
            if not defined READY (
                REM ~1s pause without extra tooling
                ping -n 2 127.0.0.1 >nul
            )
        )
    )
    if not defined READY echo [Veridian] Warning: port 3000 not confirmed; opening window anyway.
)

REM --- Locate Edge ---
set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

REM --- Open the chromeless app window ---
if defined EDGE (
    start "" "%EDGE%" --app=%APP_URL% --window-size=1400,900 --user-data-dir="%EDGE_PROFILE%"
) else (
    REM Fall back to PATH lookup if Edge wasn't in the usual spots.
    start "" msedge --app=%APP_URL% --window-size=1400,900 --user-data-dir="%EDGE_PROFILE%"
)

endlocal
