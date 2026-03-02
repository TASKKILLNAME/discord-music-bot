const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js');
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
    // 10062: 만료된 인터랙션 (봇 재시작 중 사용된 커맨드), 40060: 이미 응답됨 → 무시
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
