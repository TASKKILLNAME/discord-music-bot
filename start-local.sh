#!/bin/bash
# discord-music-bot 로컬 실행 스크립트
# Lavalink 서버 → 봇 순서로 자동 실행

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAVALINK_DIR="$SCRIPT_DIR/lavalink"
LAVALINK_PORT=2333

cleanup() {
  echo ""
  echo "🛑 종료 중..."
  [ -n "$BOT_PID" ] && kill $BOT_PID 2>/dev/null
  [ -n "$LAVALINK_PID" ] && kill $LAVALINK_PID 2>/dev/null
  wait 2>/dev/null
  echo "✅ 모두 종료됨"
  exit 0
}
trap cleanup SIGINT SIGTERM

# 이미 실행 중인 프로세스 확인
if netstat -an 2>/dev/null | grep -q ":${LAVALINK_PORT}.*LISTEN"; then
  echo "⚠️  Lavalink가 이미 포트 $LAVALINK_PORT에서 실행 중입니다."
  LAVALINK_RUNNING=true
else
  LAVALINK_RUNNING=false
fi

# ── 1. Lavalink 시작 ──
if [ "$LAVALINK_RUNNING" = false ]; then
  echo "🎵 Lavalink 서버 시작 중..."
  cd "$LAVALINK_DIR"
  java -jar Lavalink.jar &
  LAVALINK_PID=$!

  # Lavalink 준비 대기 (최대 30초)
  echo "⏳ Lavalink 준비 대기 중..."
  for i in $(seq 1 30); do
    if netstat -an 2>/dev/null | grep -q ":${LAVALINK_PORT}.*LISTEN"; then
      echo "✅ Lavalink 준비 완료! (${i}초)"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "❌ Lavalink 시작 시간 초과"
      kill $LAVALINK_PID 2>/dev/null
      exit 1
    fi
    sleep 1
  done
else
  echo "✅ Lavalink 이미 실행 중"
fi

# ── 2. 봇 시작 ──
echo "🤖 음악 봇 시작 중..."
cd "$SCRIPT_DIR"
node src/index.js &
BOT_PID=$!

echo ""
echo "========================================"
echo "🎵 음악 봇 로컬 실행 완료!"
echo "   Lavalink: localhost:$LAVALINK_PORT"
echo "   종료: Ctrl+C"
echo "========================================"

# 프로세스가 종료될 때까지 대기
wait
