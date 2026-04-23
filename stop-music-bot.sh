#!/bin/bash
# Mac/Linux 음악봇 종료 스크립트

echo "===================================="
echo "  음악봇 종료 중..."
echo "===================================="
echo ""

# 1) launchd agent 실행 중이면 stop
if launchctl list | grep -q "com.lee.discordmusicbot"; then
  echo "🛑 launchd agent 중지..."
  launchctl stop com.lee.discordmusicbot 2>/dev/null || true
fi

# 2) Lavalink (포트 2333) 종료
LAVALINK_PID=$(lsof -ti tcp:2333 2>/dev/null || true)
if [ -n "$LAVALINK_PID" ]; then
  echo "🛑 Lavalink PID $LAVALINK_PID 종료..."
  kill "$LAVALINK_PID" 2>/dev/null || true
fi

# 3) discord-music-bot 경로의 node 프로세스 종료
BOT_PIDS=$(pgrep -f "discord-music-bot.*src/index.js" 2>/dev/null || true)
if [ -n "$BOT_PIDS" ]; then
  echo "🛑 Bot PIDs: $BOT_PIDS 종료..."
  # shellcheck disable=SC2086
  kill $BOT_PIDS 2>/dev/null || true
fi

echo ""
echo "✅ 종료 완료"
