const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { textToSpeech, splitText, cleanupTTSFiles } = require('../services/ttsService');
const fs = require('fs');
const path = require('path');

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

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ 먼저 음성채널에 접속해주세요!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.reply({
        content: '❌ 봇에 음성채널 접속/말하기 권한이 없습니다.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const shoukaku = interaction.client.shoukaku;
    if (!shoukaku) {
      return interaction.editReply({ content: '❌ Lavalink이 초기화되지 않았습니다.' });
    }

    try {
      // TTS 파일 생성
      const chunks = splitText(text, 200);
      const audioFiles = [];

      for (const chunk of chunks) {
        const filePath = await textToSpeech(chunk, lang);
        audioFiles.push(filePath);
      }

      const guildId = interaction.guild.id;

      // Shoukaku로 음성채널 연결 (이미 연결되어 있으면 기존 플레이어 사용)
      let player = shoukaku.players.get(guildId);
      if (!player) {
        player = await shoukaku.joinVoiceChannel({
          guildId,
          channelId: voiceChannel.id,
          shardId: 0,
          deaf: true,
        });
      }

      // 노드에서 로컬 파일 resolve
      let node = null;
      for (const [, n] of shoukaku.nodes) {
        if (n.state === 1) { node = n; break; }
      }
      if (!node) {
        cleanupFiles(audioFiles);
        return interaction.editReply({ content: '❌ 사용 가능한 Lavalink 노드가 없습니다.' });
      }

      // 순차 재생
      let fileIndex = 0;

      const playNext = async () => {
        if (fileIndex >= audioFiles.length) {
          cleanupFiles(audioFiles);
          cleanupTTSFiles();
          return;
        }

        const absPath = path.resolve(audioFiles[fileIndex]);
        fileIndex++;

        const result = await node.rest.resolve(absPath);
        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
          console.error('TTS 트랙 로드 실패:', absPath);
          return playNext();
        }

        const track = result.loadType === 'track' ? result.data : result.data?.tracks?.[0];
        if (!track) {
          return playNext();
        }

        await player.playTrack({ track: { encoded: track.encoded } });
      };

      // end 이벤트로 다음 파일 재생
      const onEnd = async (data) => {
        if (data.reason === 'replaced' || data.reason === 'cleanup') return;
        player.off('end', onEnd);
        await playNext();
      };

      // 재생 시작 전에 리스너 등록
      const startPlay = async () => {
        if (fileIndex >= audioFiles.length) {
          cleanupFiles(audioFiles);
          cleanupTTSFiles();
          return;
        }

        const absPath = path.resolve(audioFiles[fileIndex]);
        fileIndex++;

        const result = await node.rest.resolve(absPath);
        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
          console.error('TTS 트랙 로드 실패:', absPath);
          cleanupFiles(audioFiles);
          return interaction.editReply({ content: '❌ TTS 오디오를 재생할 수 없습니다.' });
        }

        const track = result.loadType === 'track' ? result.data : result.data?.tracks?.[0];
        if (!track) {
          cleanupFiles(audioFiles);
          return interaction.editReply({ content: '❌ TTS 트랙을 찾을 수 없습니다.' });
        }

        player.on('end', onEnd);
        await player.playTrack({ track: { encoded: track.encoded } });
      };

      await startPlay();

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
    const shoukaku = interaction.client.shoukaku;
    const guildId = interaction.guild.id;
    const player = shoukaku?.players?.get(guildId);

    if (player) {
      shoukaku.leaveVoiceChannel(guildId);

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
