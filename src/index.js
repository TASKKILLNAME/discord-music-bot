const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ============================================
// Shoukaku (Lavalink 클라이언트) 설정
// ============================================
const lavalinkNodes = [
  {
    name: 'home',
    url: 'localhost:2333',
    auth: 'musicbot_lavalink_pass',
    secure: false,
  },
];

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), lavalinkNodes, {
  moveOnDisconnect: true,
  resume: false,
  reconnectTries: 5,
  restTimeout: 60000,
  voiceConnectionTimeout: 30000,
});

shoukaku.on('ready', (name) => console.log(`🔗 [Lavalink] ${name} 노드 연결됨`));
shoukaku.on('error', (name, error) => console.error(`❌ [Lavalink] ${name} 에러:`, error));
shoukaku.on('close', (name, code, reason) => console.warn(`⚠️ [Lavalink] ${name} 연결 해제: ${code} - ${reason}`));
shoukaku.on('disconnect', (name, players, moved) => {
  console.warn(`⚠️ [Lavalink] ${name} 연결 끊김, 플레이어 ${players.size}개 영향`);
});

client.shoukaku = shoukaku;

// musicService에 Shoukaku 인스턴스 전달
const musicService = require('./services/musicService');
musicService.init(shoukaku);

// ============================================
// 명령어 로드
// ============================================
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`📝 명령어 로드: ${command.data.name}`);
  }
}

// ============================================
// 봇 준비 완료
// ============================================
client.once(Events.ClientReady, (c) => {
  console.log('\n========================================');
  console.log(`🎵 ${c.user.tag} 음악 봇이 온라인입니다!`);
  console.log(`📊 ${c.guilds.cache.size}개의 서버에서 활동 중`);
  console.log('========================================\n');

  client.user.setActivity('/음악 재생 으로 음악 시작', { type: 3 });
});

// ============================================
// 슬래시 명령어 처리
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    if (error.code === 10062 || error.code === 40060) return;

    console.error(`명령어 실행 오류 (${interaction.commandName}):`, error);

    const errorMsg = {
      content: '❌ 명령어 실행 중 오류가 발생했습니다.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMsg);
      } else {
        await interaction.reply(errorMsg);
      }
    } catch {
      // 에러 응답 실패는 무시
    }
  }
});

// ============================================
// 에러 핸들링
// ============================================
client.on('error', (error) => {
  console.error('클라이언트 에러:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('처리되지 않은 프로미스 거부:', error);
});

// ============================================
// 로그인
// ============================================
client.login(process.env.DISCORD_TOKEN);
