# Discord Music Bot

YouTube/SoundCloud 등 스트리밍 재생을 지원하는 Discord 음악 봇.
Lavalink(JVM) + Shoukaku 기반으로 동작한다.

로그인 시 자동 실행되도록 설정할 수 있다 (Mac launchd / Windows 시작프로그램).

---

## 전제

- Node.js 18+
- Java 17+ (Lavalink 실행용)
- Discord Developer Portal에서 생성된 봇 토큰
  - Privileged Gateway Intent: **MESSAGE CONTENT** 필요할 수 있음

---

## 설치

### 1. 클론

```bash
git clone https://github.com/TASKKILLNAME/discord-music-bot.git
cd discord-music-bot
```

### 2. 플랫폼별 설치 스크립트

**Mac** (Apple Silicon / Intel 공통):

```bash
bash scripts/install-mac.sh
```

**Windows**:

```cmd
scripts\install-windows.bat
```

설치 스크립트가 하는 일:
1. Node/Java 설치 여부 확인
2. `npm install`
3. `.env.example` → `.env` 복사 후 토큰 입력 안내
4. 로그인 시 자동 실행되도록 등록 (Mac: launchd / Windows: 시작프로그램 VBS)

### 3. `.env` 작성

설치 스크립트 중 안내에 따라 편집기로 열어 입력:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_client_id_here
# GUILD_ID=optional_test_guild_id
```

토큰은 [Discord Developer Portal](https://discord.com/developers/applications) → 봇 애플리케이션 → Bot → Reset Token.

---

## 실행 / 중지

### 자동 실행 (로그인 시)
설치 스크립트로 등록되면 로그인할 때마다 자동으로 시작된다. 별도 조작 불필요.

### 수동 실행

**Mac**:
```bash
launchctl start com.lee.discordmusicbot   # 시작
launchctl stop com.lee.discordmusicbot    # 중지
# 또는 foreground로:
bash start-local.sh
```

**Windows**:
```cmd
wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start-music-bot.vbs"
stop-music-bot.bat
```

### 로그 확인

```bash
tail -f bot.log                # Mac/Linux
type bot.log                   # Windows
```

---

## 자동 실행 해제

**Mac**:
```bash
launchctl unload ~/Library/LaunchAgents/com.lee.discordmusicbot.plist
rm ~/Library/LaunchAgents/com.lee.discordmusicbot.plist
```

**Windows**:
```cmd
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start-music-bot.vbs"
```

---

## 구조

```
discord-music-bot/
├── src/
│   ├── index.js              # 엔트리: Discord + Lavalink 연결
│   ├── commands/             # /음악 /노래 /tts 등 슬래시 명령어
│   └── services/             # 큐 / 재생 / TTS 등 비즈니스 로직
├── lavalink/
│   ├── Lavalink.jar          # Lavalink 서버 (git에 포함됨, 95MB)
│   ├── application.yml       # Lavalink 설정 + YouTube 플러그인
│   └── plugins/              # YouTube plugin jar
├── scripts/
│   ├── install-mac.sh
│   ├── install-windows.bat
│   ├── com.lee.discordmusicbot.plist.template
│   └── start-music-bot.vbs.template
├── start-local.sh            # Mac/Linux foreground 실행
├── stop-music-bot.sh         # Mac/Linux 종료
├── stop-music-bot.bat        # Windows 종료
└── .env.example
```

---

## 두 대에서 같은 봇을 동시에 실행하지 말 것

동일한 `DISCORD_TOKEN`으로 두 머신에서 동시에 로그인하면 Discord가 한쪽을 끊는다.
Mac으로 옮길 때는 데스크탑 쪽 실행을 먼저 중지하자.

---

## 트러블슈팅

- **Lavalink가 안 뜸**: `java -version` 17+ 확인. `lavalink/lavalink.log` 확인.
- **봇이 음성채널 입장 실패**: Discord 봇 권한에 `Connect`, `Speak` 포함됐는지 확인.
- **YouTube 재생 실패**: `cookies.txt` 필요할 수 있음. yt-dlp로 브라우저에서 export 후 프로젝트 루트에 배치 (머신별로 따로 준비, git에 안 올라감).
- **Mac에서 Java 설치 후 실행 안 됨**:
  ```bash
  sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
  ```
