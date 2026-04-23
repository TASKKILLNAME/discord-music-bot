@echo off
chcp 65001 >nul
echo.
echo ====================================
echo   음악봇 종료 중...
echo ====================================
echo.

REM Lavalink 종료 (포트 2333 점유한 javaw 프로세스)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":2333" ^| findstr "LISTENING"') do (
    echo Lavalink PID %%a 종료 중...
    taskkill /PID %%a /F >nul 2>&1
)

REM discord-music-bot 경로의 node 프로세스만 종료
for /f "tokens=2" %%p in ('wmic process where "name='node.exe' and commandline like '%%discord-music-bot%%'" get ProcessId /format:value ^| findstr "="') do (
    echo Bot PID %%p 종료 중...
    taskkill /PID %%p /F >nul 2>&1
)

echo.
echo ✅ 종료 완료
echo.
pause
