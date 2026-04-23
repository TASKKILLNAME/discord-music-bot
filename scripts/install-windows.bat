@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Discord Music Bot — Windows 설치 스크립트
REM 로그인 시 자동 실행되도록 시작프로그램 폴더에 VBS 등록

set "PROJECT_DIR=%~dp0.."
pushd "%PROJECT_DIR%"
set "PROJECT_DIR=%CD%"
popd

set "TEMPLATE=%PROJECT_DIR%\scripts\start-music-bot.vbs.template"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_DST=%STARTUP_DIR%\start-music-bot.vbs"

echo 🎵 Discord Music Bot — Windows 설치 시작
echo 📁 프로젝트 위치: %PROJECT_DIR%
echo.

REM ── 1. 필수 런타임 확인 ──
where node >nul 2>&1 || (
  echo ❌ Node.js가 필요합니다. https://nodejs.org/
  exit /b 1
)
where javaw >nul 2>&1 || (
  echo ❌ Java(17+)가 필요합니다. https://adoptium.net/
  exit /b 1
)
echo ✅ Node.js 확인
echo ✅ Java 확인
echo.

REM ── 2. npm install ──
echo 📦 의존성 설치 중...
cd /d "%PROJECT_DIR%"
call npm install
echo.

REM ── 3. .env 생성 ──
if not exist "%PROJECT_DIR%\.env" (
  copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env" >nul
  echo ⚠️  .env 파일을 생성했습니다. 메모장으로 열어 토큰을 입력하세요:
  echo     notepad "%PROJECT_DIR%\.env"
  echo.
  pause
)

REM ── 4. 시작프로그램 VBS 생성 (경로 치환) ──
echo 🔧 시작프로그램에 등록 중...
powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath $env:TEMPLATE).Replace('__PROJECT_DIR__', $env:PROJECT_DIR) | Set-Content -Encoding UTF8 -LiteralPath $env:VBS_DST"

echo.
echo ========================================
echo ✅ 설치 완료!
echo.
echo ▶  지금 바로 시작:   wscript "%VBS_DST%"
echo ⏹  중지:              %PROJECT_DIR%\stop-music-bot.bat
echo 📋 로그:              type "%PROJECT_DIR%\bot.log"
echo.
echo 로그인 시 자동으로 실행됩니다.
echo ========================================
pause
