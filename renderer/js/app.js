/**
 * app.js — 主渲染进程编排器
 *
 * 连接: SpotifyTrack, LyricsEngine, AudioAnalyzer, OceanScene, UI
 */
(function() {
  'use strict';

  let _spotifyConnected = false, _lastTrackId = null;

  // =========================================================================
  // 初始化
  // =========================================================================
  async function init() {
    console.log('🌊 Spotify 歌词液态玻璃 v2.0 — 启动');

    UI.init();

    // 1. 初始化 3D 场景
    const canvas = document.getElementById('ocean-canvas');
    if (!OceanScene.init(canvas)) {
      console.error('3D 场景初始化失败');
      return;
    }

    // 2. 启动 Mock 音频 (WSL 调试模式)
    //    在 Windows 真机上可改为 AudioAnalyzer.startReal(sourceId)
    AudioAnalyzer.startMock();

    // 3. 检查 Spotify 连接
    const hasToken = await SpotifyTrack.checkAuth();
    if (hasToken) {
      _onSpotifyConnected();
    }

    // 4. Spotify 事件
    SpotifyTrack.onAuthChange((ok) => { if (ok) _onSpotifyConnected(); });
    SpotifyTrack.onUpdate((pb) => _onPlaybackUpdate(pb));

    // 监听 Main Process 的 auth 完成事件
    window.electronAPI.onSpotifyAuthComplete((ok) => {
      if (ok) _onSpotifyConnected();
    });

    // 5. UI 事件绑定
    UI.getConnectButton().addEventListener('click', async () => {
      UI.getConnectButton().disabled = true;
      UI.getConnectButton().textContent = '⋯';
      await SpotifyTrack.startAuth();
      UI.getConnectButton().disabled = false;
      UI.getConnectButton().textContent = '连接';
    });

    UI.getPlayButton().addEventListener('click', () => {
      SpotifyTrack.controlPlayback(SpotifyTrack.isPlaying() ? 'pause' : 'play');
    });
    UI.getPrevButton().addEventListener('click', () => SpotifyTrack.controlPlayback('previous'));
    UI.getNextButton().addEventListener('click', () => SpotifyTrack.controlPlayback('next'));

    // 6. 启动渲染循环
    OceanScene.start();

    // 7. 主循环 (音频分析 + UI 音频条)
    _mainLoop();

    // 8. 窗口大小调整
    window.addEventListener('resize', () => {
      OceanScene.resize(window.innerWidth, window.innerHeight);
    });

    console.log('✅ 应用初始化完成 (Mock 音频模式)');
  }

  // =========================================================================
  // Spotify 连接
  // =========================================================================
  function _onSpotifyConnected() {
    _spotifyConnected = true;
    UI.setSpotifyConnected(true);
    SpotifyTrack.startPolling();
    UI.showControls(true);
    console.log('🎵 Spotify 已连接，开始轮询');
  }

  // =========================================================================
  // 播放状态更新
  // =========================================================================
  async function _onPlaybackUpdate(playback) {
    if (!playback || !playback.track) {
      UI.updateSongInfo(null, 0, false);
      UI.hideLyrics();
      return;
    }

    const track = playback.track;
    UI.updateSongInfo(track, playback.progressMs, playback.isPlaying);

    // 歌曲变化 → 加载歌词
    if (track.id !== _lastTrackId) {
      _lastTrackId = track.id;
      const hasLyrics = await LyricsEngine.loadLyrics(track);
      if (!hasLyrics) UI.hideLyrics();
    }

    // 更新歌词行
    const result = LyricsEngine.getCurrentLines(playback.progressMs);
    if (result.lines.length > 0) {
      UI.updateLyrics(result.lines);
    }
  }

  // =========================================================================
  // 主循环
  // =========================================================================
  function _mainLoop() {
    const energy = AudioAnalyzer.update();
    if (energy) {
      UI.updateAudioBars(energy.bass, energy.mid, energy.high);
    }
    requestAnimationFrame(_mainLoop);
  }

  // =========================================================================
  // 启动
  // =========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
