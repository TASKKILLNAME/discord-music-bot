/**
 * Music Service - Lavalink + Shoukaku 기반
 *
 * 기존 yt-dlp + ffmpeg 조합을 Lavalink으로 대체.
 * export 인터페이스는 기존과 동일하게 유지하여 commands/ 파일 수정 불필요.
 */

// 길드별 대기열 관리
const queues = new Map();

// Shoukaku 인스턴스 참조 (init에서 설정)
let shoukaku = null;

/**
 * Shoukaku 인스턴스 설정 (index.js에서 호출)
 */
function init(shoukakuInstance) {
  shoukaku = shoukakuInstance;
}

/**
 * Lavalink 노드 가져오기
 */
function getNode() {
  if (!shoukaku) throw new Error('사용 가능한 Lavalink 노드가 없습니다. (shoukaku 미초기화)');
  for (const [name, node] of shoukaku.nodes) {
    console.log(`[getNode] 노드: ${name}, state: ${node.state}`);
    if (node.state === 1) return node;
  }
  throw new Error('사용 가능한 Lavalink 노드가 없습니다.');
}

/**
 * 대기열 가져오기 (없으면 생성)
 */
function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      songs: [],
      player: null,
      textChannel: null,
      playing: false,
      disconnectTimer: null,
    });
  }
  return queues.get(guildId);
}

/**
 * 곡 추가
 */
function addSong(guildId, song) {
  const queue = getQueue(guildId);
  queue.songs.push(song);
  return queue.songs.length;
}

/**
 * YouTube 검색 또는 URL에서 곡 정보 추출
 */
async function searchAndGetInfo(query) {
  const node = getNode();

  const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//;
  let searchQuery;

  if (urlPattern.test(query)) {
    try {
      const urlObj = new URL(query.startsWith('http') ? query : `https://${query}`);
      urlObj.searchParams.delete('list');
      urlObj.searchParams.delete('start_radio');
      urlObj.searchParams.delete('index');
      searchQuery = urlObj.toString();
    } catch {
      searchQuery = query;
    }
  } else {
    searchQuery = `ytsearch:${query}`;
  }

  const result = await node.rest.resolve(searchQuery);

  if (!result || result.loadType === 'empty' || result.loadType === 'error') {
    return null;
  }

  let track;

  switch (result.loadType) {
    case 'track':
      track = result.data;
      break;
    case 'search':
      if (!result.data.length) return null;
      track = pickBestTrack(result.data, query);
      break;
    case 'playlist':
      if (!result.data.tracks.length) return null;
      track = result.data.tracks[0];
      break;
    default:
      return null;
  }

  return {
    title: track.info.title,
    url: track.info.uri,
    duration: formatDuration(Math.floor(track.info.length / 1000)),
    durationSec: Math.floor(track.info.length / 1000),
    thumbnail: track.info.artworkUrl || null,
    channel: track.info.author || '알 수 없음',
    encoded: track.encoded,
  };
}

/**
 * 검색 결과에서 최적 트랙 선택
 */
function pickBestTrack(tracks, query) {
  if (!query || tracks.length <= 1) return tracks[0];

  const q = query.toLowerCase().replace(/[^\w\s가-힣]/g, '');
  const qWords = q.split(/\s+/).filter((w) => w.length > 1);

  if (qWords.length === 0) return tracks[0];

  const valid = tracks.filter((t) => !t.info.isStream && t.info.length > 0 && t.info.length <= 3600000);
  const candidates = valid.length > 0 ? valid : tracks;

  let bestIdx = 0;
  let bestScore = 0;

  candidates.forEach((t, i) => {
    const title = (t.info.title || '').toLowerCase().replace(/[^\w\s가-힣]/g, '');
    const matchedWords = qWords.filter((w) => title.includes(w));
    const score = matchedWords.length / qWords.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  if (bestScore > 0.5 && bestIdx !== 0) {
    const firstTitle = (candidates[0].info.title || '').toLowerCase().replace(/[^\w\s가-힣]/g, '');
    const firstWords = qWords.filter((w) => firstTitle.includes(w));
    const firstScore = firstWords.length / qWords.length;
    if (bestScore > firstScore) {
      return candidates[bestIdx];
    }
  }

  return candidates[0];
}

/**
 * 현재 곡 재생
 */
async function playCurrentSong(guildId) {
  const queue = getQueue(guildId);

  if (queue.songs.length === 0) {
    queue.playing = false;
    startDisconnectTimer(guildId);
    return;
  }

  clearDisconnectTimer(guildId);

  const song = queue.songs[0];
  queue.playing = true;

  try {
    if (!queue.player) {
      throw new Error('Lavalink 플레이어가 없습니다.');
    }

    if (song.encoded) {
      await queue.player.playTrack({ track: { encoded: song.encoded } });
    } else {
      const node = getNode();
      const result = await node.rest.resolve(song.url);
      if (!result || result.loadType === 'empty' || result.loadType === 'error') {
        throw new Error('트랙을 로드할 수 없습니다.');
      }
      const track = result.loadType === 'track' ? result.data : result.data.tracks?.[0] || result.data[0];
      if (!track) throw new Error('트랙을 찾을 수 없습니다.');
      await queue.player.playTrack({ track: { encoded: track.encoded } });
    }
  } catch (err) {
    console.error('음악 재생 오류:', err);

    queue.songs.shift();
    if (queue.textChannel) {
      queue.textChannel.send(`❌ **${song.title}** 재생에 실패했습니다. 다음 곡으로 넘어갑니다.`).catch(() => {});
    }
    return playCurrentSong(guildId);
  }
}

/**
 * 음성 채널 연결 + Shoukaku 플레이어 세팅
 */
async function connectAndSetup(guildId, voiceChannel, textChannel, adapterCreator) {
  const queue = getQueue(guildId);

  if (queue.player) {
    queue.textChannel = textChannel;
    return;
  }

  // 기존 stale 연결이 있으면 먼저 정리
  try {
    const existing = shoukaku.connections.get(guildId);
    if (existing) {
      console.log(`[connectAndSetup] 기존 연결 정리: ${guildId}`);
      shoukaku.leaveVoiceChannel(guildId);
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (e) {
    console.warn('[connectAndSetup] stale 연결 정리 실패:', e.message);
  }

  const player = await shoukaku.joinVoiceChannel({
    guildId: guildId,
    channelId: voiceChannel.id,
    shardId: 0,
    deaf: true,
  });

  let endProcessing = false;
  player.on('end', async (data) => {
    if (data.reason === 'replaced' || data.reason === 'cleanup') return;
    if (endProcessing) return;
    endProcessing = true;

    try {
      const q = queues.get(guildId);
      if (!q || q.player !== player) return; // 이미 정리된 큐면 무시

      q.songs.shift();
      if (q.songs.length > 0) {
        const nextSong = q.songs[0];
        if (q.textChannel) {
          q.textChannel.send(`🎵 **지금 재생:** ${nextSong.title} [${nextSong.duration}]`).catch(() => {});
        }
        await playCurrentSong(guildId);
      } else {
        q.playing = false;
        if (q.textChannel) {
          q.textChannel.send('📭 대기열의 모든 곡을 재생했습니다. 3분 후 자동으로 퇴장합니다.').catch(() => {});
        }
        startDisconnectTimer(guildId);
      }
    } finally {
      endProcessing = false;
    }
  });

  player.on('exception', (error) => {
    console.error('Lavalink 플레이어 예외:', error);
  });

  player.on('closed', (data) => {
    console.warn('Lavalink 플레이어 연결 끊김:', data);
    // 4014 = 채널 이동 (moveOnDisconnect가 처리) → 무시
    if (data.code === 4014) return;
    const q = queues.get(guildId);
    // 현재 플레이어와 일치할 때만 정리 (이미 stop()으로 정리된 큐면 무시)
    if (q && q.player === player) {
      q.player = null;
      q.playing = false;
    }
  });

  queue.player = player;
  queue.textChannel = textChannel;
}

/**
 * 스킵
 */
function skip(guildId) {
  const queue = getQueue(guildId);
  if (!queue.player) return false;
  queue.player.stopTrack();
  return true;
}

/**
 * 정지
 */
function stop(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return true;

  const player = queue.player;
  queue.player = null; // closed 이벤트에서 이 큐를 건드리지 않게 먼저 해제
  queue.songs = [];
  queue.playing = false;
  clearDisconnectTimer(guildId);
  queues.delete(guildId);

  if (player) {
    try {
      if (shoukaku) shoukaku.leaveVoiceChannel(guildId);
    } catch (err) {
      console.error('음성채널 퇴장 오류:', err);
    }
  }

  return true;
}

/**
 * 일시정지
 */
function pause(guildId) {
  const queue = getQueue(guildId);
  if (!queue.player) return false;
  queue.player.setPaused(true);
  return true;
}

/**
 * 다시재생
 */
function resume(guildId) {
  const queue = getQueue(guildId);
  if (!queue.player) return false;
  queue.player.setPaused(false);
  return true;
}

/**
 * 대기열에서 특정 곡 제거 (index: 대기열 번호, 1부터 시작 = songs[1]부터)
 * songs[0]은 현재 재생 중이므로 제거 대상 아님
 */
function removeSong(guildId, index) {
  const queue = getQueue(guildId);
  if (index < 1 || index >= queue.songs.length) return null;
  const [removed] = queue.songs.splice(index, 1);
  return removed;
}

/**
 * 대기열 정보
 */
function getQueueInfo(guildId) {
  const queue = getQueue(guildId);
  return {
    songs: [...queue.songs],
    playing: queue.playing,
  };
}

/**
 * 3분 후 자동 퇴장 타이머
 */
function startDisconnectTimer(guildId) {
  const queue = getQueue(guildId);
  clearDisconnectTimer(guildId);

  queue.disconnectTimer = setTimeout(() => {
    const q = queues.get(guildId);
    if (q && !q.playing && q.songs.length === 0) {
      if (q.textChannel) {
        q.textChannel.send('👋 3분간 재생이 없어 음성채널에서 퇴장합니다.').catch(() => {});
      }
      stop(guildId);
    }
  }, 3 * 60 * 1000);
}

/**
 * 타이머 취소
 */
function clearDisconnectTimer(guildId) {
  const queue = queues.get(guildId);
  if (queue?.disconnectTimer) {
    clearTimeout(queue.disconnectTimer);
    queue.disconnectTimer = null;
  }
}

/**
 * 정리
 */
function cleanup(guildId) {
  const queue = queues.get(guildId);
  if (queue) {
    queue.songs = [];
    queue.playing = false;
    clearDisconnectTimer(guildId);
    try {
      if (shoukaku) shoukaku.leaveVoiceChannel(guildId);
    } catch {}
    queues.delete(guildId);
  }
}

/**
 * 초를 MM:SS 또는 HH:MM:SS 형식으로 변환
 */
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return 'LIVE';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  init,
  getQueue,
  addSong,
  removeSong,
  searchAndGetInfo,
  playCurrentSong,
  connectAndSetup,
  skip,
  stop,
  pause,
  resume,
  getQueueInfo,
};
