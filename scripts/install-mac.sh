#!/bin/bash
# Discord Music Bot — Mac 설치 스크립트
# 로그인 시 자동 실행되도록 launchd agent 등록

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$PROJECT_DIR/scripts/com.lee.discordmusicbot.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/com.lee.discordmusicbot.plist"

echo "🎵 Discord Music Bot — Mac 설치 시작"
echo "📁 프로젝트 위치: $PROJECT_DIR"
echo ""

# ── 1. 필수 런타임 확인 ──
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js가 필요합니다. 설치: brew install node"
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "❌ Java(17+)가 필요합니다. 설치: brew install openjdk@17"
  echo "   설치 후 system Java에 연결:"
  echo "   sudo ln -sfn \$(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk"
  exit 1
fi
echo "✅ Node.js: $(node -v)"
echo "✅ Java: $(java -version 2>&1 | head -1)"
echo ""

# ── 2. npm install ──
echo "📦 의존성 설치 중..."
cd "$PROJECT_DIR"
npm install
echo ""

# ── 3. .env 생성 ──
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  echo "⚠️  .env 파일을 생성했습니다. 편집기로 열어 토큰을 입력하세요:"
  echo "    open -e \"$PROJECT_DIR/.env\""
  echo ""
  echo "⏸  토큰 입력 후 Enter를 눌러 계속..."
  read -r
fi

# ── 4. launchd plist 생성 (경로 치환) ──
echo "🔧 launchd agent 등록 중..."
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

# ── 5. 기존 agent 있으면 언로드 후 재로드 ──
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo ""
echo "========================================"
echo "✅ 설치 완료!"
echo ""
echo "▶  지금 바로 시작:       launchctl start com.lee.discordmusicbot"
echo "⏹  중지:                  launchctl stop com.lee.discordmusicbot"
echo "🗑  자동시작 해제:        launchctl unload $PLIST_DST"
echo "📋 로그:                  tail -f $PROJECT_DIR/bot.log"
echo ""
echo "로그인 시 자동으로 실행됩니다."
echo "========================================"
