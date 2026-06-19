/**
 * spotify.js — Spotify 元数据轨道 (Renderer Process)
 *
 * 通过 electronAPI 与 Main Process 通信，不再直接调用 Spotify API。
 * Main Process 持有 token 并代理所有 API 请求。
 */
const SpotifyTrack = (() => {
  'use strict';

  let _currentTrack = null, _progressMs = 0, _isPlaying = false;
  let _audioFeatures = null, _afCache = {};
  let _pollTimer = null;
  let _onUpdate = null, _onAuthChange = null;

  async function startAuth() {
    const ok = await window.electronAPI.spotifyStartAuth();
    if (_onAuthChange) _onAuthChange(ok);
    return ok;
  }

  async function checkAuth() {
    const t = await window.electronAPI.spotifyGetToken();
    if (t) { if (_onAuthChange) _onAuthChange(true); return true; }
    return false;
  }

  async function fetchCurrentPlayback() {
    try {
      const data = await window.electronAPI.spotifyApiRequest('/v1/me/player/currently-playing');
      if (!data || !data.item) { _isPlaying = false; _currentTrack = null; return null; }
      _currentTrack = data.item;
      _progressMs = data.progress_ms || 0;
      _isPlaying = data.is_playing;
      const tid = _currentTrack.id;
      if (_afCache[tid]) _audioFeatures = _afCache[tid];
      else fetchAudioFeatures(tid).catch(() => {});
      return { track: _currentTrack, progressMs: _progressMs, isPlaying: _isPlaying };
    } catch (e) { return null; }
  }

  async function fetchAudioFeatures(trackId) {
    if (_afCache[trackId]) { _audioFeatures = _afCache[trackId]; return _audioFeatures; }
    try {
      const data = await window.electronAPI.spotifyApiRequest(`/v1/audio-features/${trackId}`);
      _audioFeatures = data;
      const keys = Object.keys(_afCache);
      if (keys.length >= 50) delete _afCache[keys[0]];
      _afCache[trackId] = data;
      return data;
    } catch (_) { return null; }
  }

  async function controlPlayback(action) {
    await window.electronAPI.spotifyControl(action);
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(async () => {
      const pb = await fetchCurrentPlayback();
      if (_onUpdate) _onUpdate(pb);
    }, CONFIG.SPOTIFY.POLL_INTERVAL_MS);
  }

  function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

  return {
    startAuth, checkAuth, fetchCurrentPlayback, fetchAudioFeatures,
    controlPlayback, startPolling, stopPolling,
    getCurrentTrack: () => _currentTrack,
    getProgressMs: () => _progressMs,
    isPlaying: () => _isPlaying,
    getAudioFeatures: () => _audioFeatures,
    onUpdate: (fn) => { _onUpdate = fn; },
    onAuthChange: (fn) => { _onAuthChange = fn; }
  };
})();
