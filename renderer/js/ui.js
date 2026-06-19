/**
 * ui.js — 液态玻璃 UI 叠加层管理
 *
 * 职责:
 *   - 窗口控制按钮
 *   - Spotify 连接状态
 *   - 歌曲信息 + 专辑封面
 *   - 歌词滚动
 *   - 播放控制
 *   - 音频能量指示器
 */

const UI = (() => {
  'use strict';

  const DOM = {};

  // =========================================================================
  // 初始化 DOM 引用
  // =========================================================================
  function init() {
    DOM.titlebar       = document.getElementById('titlebar');
    DOM.btnMin         = document.getElementById('btn-minimize');
    DOM.btnMax         = document.getElementById('btn-maximize');
    DOM.btnClose       = document.getElementById('btn-close');

    DOM.statusDot      = document.getElementById('status-dot');
    DOM.statusText     = document.getElementById('status-text');
    DOM.btnConnect     = document.getElementById('btn-connect-spotify');

    DOM.songInfo       = document.getElementById('song-info');
    DOM.albumCover     = document.getElementById('album-cover');
    DOM.songTitle      = document.getElementById('song-title');
    DOM.songArtist     = document.getElementById('song-artist');
    DOM.progressFill   = document.getElementById('progress-fill');
    DOM.timeText       = document.getElementById('time-text');

    DOM.lyricsContainer = document.getElementById('lyrics-container');
    DOM.lyricsScroll   = document.getElementById('lyrics-scroll');

    DOM.controls       = document.getElementById('controls');
    DOM.btnPrev        = document.getElementById('btn-prev');
    DOM.btnPlay        = document.getElementById('btn-play');
    DOM.btnNext        = document.getElementById('btn-next');

    DOM.audioChip      = document.getElementById('audio-bars-container');
    DOM.barBass        = document.getElementById('bar-bass');
    DOM.barMid         = document.getElementById('bar-mid');
    DOM.barHigh        = document.getElementById('bar-high');

    // 窗口控制
    DOM.btnMin.addEventListener('click', () => window.electronAPI.minimize());
    DOM.btnMax.addEventListener('click', () => window.electronAPI.maximize());
    DOM.btnClose.addEventListener('click', () => window.electronAPI.close());

    // 标题栏拖拽 (通过 CSS -webkit-app-region: drag)
    DOM.titlebar.style.webkitAppRegion = 'drag';
  }

  // =========================================================================
  // Spotify 状态
  // =========================================================================
  function setSpotifyConnected(connected) {
    DOM.statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    DOM.statusText.textContent = connected ? 'Spotify 已连接' : '未连接 Spotify';
    DOM.btnConnect.style.display = connected ? 'none' : 'inline-block';
  }

  function getConnectButton() { return DOM.btnConnect; }

  // =========================================================================
  // 歌曲信息
  // =========================================================================
  function updateSongInfo(track, progressMs, isPlaying) {
    if (!track) { DOM.songInfo.classList.add('hidden'); return; }
    DOM.songInfo.classList.remove('hidden');

    if (track.album?.images?.length) {
      DOM.albumCover.src = track.album.images[0].url;
    }
    DOM.songTitle.textContent = track.name;
    DOM.songArtist.textContent = track.artists.map(a => a.name).join(', ');

    if (track.duration_ms > 0) {
      DOM.progressFill.style.width = (progressMs / track.duration_ms * 100) + '%';
    }
    DOM.timeText.textContent = fmtTime(progressMs) + ' / ' + fmtTime(track.duration_ms);
    DOM.btnPlay.textContent = isPlaying ? '⏸' : '▶';
  }

  function showControls(show) {
    DOM.controls.classList.toggle('hidden', !show);
  }

  function getPlayButton() { return DOM.btnPlay; }
  function getPrevButton() { return DOM.btnPrev; }
  function getNextButton() { return DOM.btnNext; }

  // =========================================================================
  // 歌词
  // =========================================================================
  function updateLyrics(lines) {
    DOM.lyricsContainer.classList.remove('hidden');
    if (!lines || lines.length === 0) {
      DOM.lyricsScroll.innerHTML = '<p class="lyrics-placeholder">🎵 等待歌词...</p>';
      return;
    }
    DOM.lyricsScroll.innerHTML = lines.map(l =>
      `<p class="lyric-line${l.isActive ? ' active' : ''}">${escHtml(l.text || '♫')}</p>`
    ).join('');
    // 滚动活跃行到中心
    const active = DOM.lyricsScroll.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function hideLyrics() {
    DOM.lyricsContainer.classList.add('hidden');
  }

  // =========================================================================
  // 音频指示器
  // =========================================================================
  function updateAudioBars(bass, mid, high) {
    DOM.audioChip.classList.remove('hidden');
    DOM.barBass.style.height  = Math.max(2, bass * 24) + 'px';
    DOM.barMid.style.height   = Math.max(2, mid * 24) + 'px';
    DOM.barHigh.style.height  = Math.max(2, high * 24) + 'px';
  }

  function showAudioIndicator(show) {
    DOM.audioChip.classList.toggle('hidden', !show);
  }

  // =========================================================================
  // 工具
  // =========================================================================
  function fmtTime(ms) {
    if (!ms || ms < 0) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return {
    init, setSpotifyConnected, getConnectButton,
    updateSongInfo, showControls, getPlayButton, getPrevButton, getNextButton,
    updateLyrics, hideLyrics, updateAudioBars, showAudioIndicator
  };
})();
