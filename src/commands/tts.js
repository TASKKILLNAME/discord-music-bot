const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { textToSpeech, splitText, cleanupTTSFiles } = require('../services/ttsService');
const fs = require('fs');

// 서버별 플레이어 관리
const players = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('텍스트를 음성으로 읽어줍니다 (TTS)')
    .addSubcommand((sub) =>
      sub
        .setName('말하기')
        .setDescription('텍스트를 음성채널에서 읽어줍니다')
        .addStringOption((opt) =>
          opt
            .setName('텍스트')
            .setDescription('읽을 텍스트 (최대 500자)')
            .setRequired(true)
            .setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt
            .setName('언어')
            .setDescription('TTS 언어 (기본: 한국어)')
            .addChoices(
              { name: '🇰🇷 한국어', value: 'ko' },
              { name: '🇺🇸 영어', value: 'en' },
              { name: '🇯🇵 일본어', value: 'ja' },
              { name: '🇨🇳 중국어', value: 'zh-CN' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('나가기')
        .setDescription('봇을 음성채널에서 내보냅니다')
    ),

  async execute(interaction) {
    // 클라우드 환경(Railway 등)에서는 UDP를 지원하지 않아 음성채널 사용 불가
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
      return interaction.reply({
        content: '⚠️ 현재 클라우드 환경에서 운영 중이라 TTS(음성채널) 기능을 사용할 수 없습니다.\n> 클라우드 서비스(Railway)는 UDP 연결을 지원하지 않아 음성채널 접속이 불가합니다.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case '말하기':
        return this.speak(interaction);
      case '나가기':
        return this.leave(interaction);
    }
  },

  async speak(interaction) {
    const text = interaction.options.getString('텍스트');
    const lang = interaction.options.getString('언어') || 'ko';

    // 사용자가 음성채널에 있는지 확인
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ 먼저 음성채널에 접속해주세요!',
        flags: MessageFlags.Ephemeral,
      });
    }

    // 봇 권한 확인
    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.reply({
        content: '❌ 봇에 음성채널 접속/말하기 권한이 없습니다.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // TTS 파일 생성
      const chunks = splitText(text, 200);
      const audioFiles = [];

      for (const chunk of chunks) {
        const filePath = await textToSpeech(chunk, lang);
        audioFiles.push(filePath);
      }

      // 음성채널 접속
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      // 연결 대기
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      } catch {
        connection.destroy();
        return interaction.editReply({
          content: '❌ 음성채널 연결에 실패했습니다.',
        });
      }

      // 오디오 플레이어 생성
      const player = createAudioPlayer();
      connection.subscribe(player);
      players.set(interaction.guild.id, { player, connection });

      // 순차 재생
      let fileIndex = 0;

      const playNext = () => {
        if (fileIndex >= audioFiles.length) {
          // 모든 파일 재생 완료 → 정리
          cleanupFiles(audioFiles);
          cleanupTTSFiles();
          return;
        }

        const resource = createAudioResource(audioFiles[fileIndex]);
        player.play(resource);
        fileIndex++;
      };

      player.on(AudioPlayerStatus.Idle, playNext);

      player.on('error', (err) => {
        console.error('오디오 재생 오류:', err.message);
        cleanupFiles(audioFiles);
      });

      // 첫 번째 파일 재생
      playNext();

      const langNames = { ko: '한국어', en: '영어', ja: '일본어', 'zh-CN': '중국어' };

      const embed = new EmbedBuilder()
        .setTitle('🔊 TTS 재생 중')
        .setDescription(`"${text.length > 100 ? text.substring(0, 100) + '...' : text}"`)
        .addFields(
          { name: '🎙️ 채널', value: voiceChannel.name, inline: true },
          { name: '🌐 언어', value: langNames[lang] || lang, inline: true },
          { name: '📝 글자 수', value: `${text.length}자`, inline: true }
        )
        .setColor(0x00ff00);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('TTS 오류:', err);
      await interaction.editReply({
        content: `❌ TTS 실패: ${err.message}`,
      });
    }
  },

  async leave(interaction) {
    const guildData = players.get(interaction.guild.id);

    if (guildData) {
      guildData.player.stop();
      guildData.connection.destroy();
      players.delete(interaction.guild.id);

      await interaction.reply({
        content: '👋 음성채널에서 나갔습니다.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: '❌ 현재 음성채널에 접속해 있지 않습니다.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

/**
 * 임시 파일 정리
 */
function cleanupFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // 무시
    }
  }
}