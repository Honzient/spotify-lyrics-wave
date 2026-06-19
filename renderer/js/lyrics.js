/**
 * lyrics.js — 歌词获取与 LRC 解析 (Renderer Process)
 *
 * 通过 electronAPI.lyricsFetch 代理请求 LRCLIB，绕过 CORS。
 */
const LyricsEngine = (() => {
  'use strict';

  let _synced = null, _plain = null, _trackId = null, _onUpdate = null;

  function parseLRC(text) {
    const lines = [], re = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const line of text.split('\n')) {
      const ts = []; let m;
      while ((m = re.exec(line.trim())) !== null) {
        let ms = 0;
        if (m[3]) ms = m[3].length === 2 ? parseInt(m[3]) * 10 : parseInt(m[3]);
        ts.push((parseInt(m[1]) * 60 + parseInt(m[2])) * 1000 + ms);
      }
      re.lastIndex = 0;
      const txt = line.trim().replace(re, '').trim();
      for (const t of ts) lines.push({ timeMs: t, text: txt || '♫' });
    }
    lines.sort((a, b) => a.timeMs - b.timeMs);
    return lines.filter((l, i) => i === 0 || l.timeMs !== lines[i - 1].timeMs || l.text !== lines[i - 1].text);
  }

  async function loadLyrics(track) {
    if (!track) { _synced = null; _plain = null; _trackId = null; if (_onUpdate) _onUpdate(null); return false; }
    if (_trackId === track.id && _synced) return true;
    _trackId = track.id; _synced = null; _plain = null;

    const result = await window.electronAPI.lyricsFetch(
      track.name,
      track.artists.map(a => a.name).join(', '),
      track.album?.name || '',
      track.duration_ms || 0
    );

    if (result?.syncedLyrics) _synced = parseLRC(result.syncedLyrics);
    else if (result?.plainLyrics) _plain = result.plainLyrics.split('\n').map(l => l.trim()).filter(Boolean);

    if (_onUpdate) _onUpdate({ synced: _synced, plain: _plain, trackId: track.id });
    return !!(_synced || _plain);
  }

  function getCurrentLines(progressMs) {
    if (!_synced) return { currentIndex: -1, lines: [] };
    let lo = 0, hi = _synced.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >>> 1; if (_synced[mid].timeMs <= progressMs) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    const half = 5, start = Math.max(0, idx - half), end = Math.min(_synced.length, start + 11);
    return { currentIndex: idx, lines: _synced.slice(start, end).map((l, i) => ({ ...l, isActive: (start + i) === idx })) };
  }

  return {
    loadLyrics, getCurrentLines,
    getPlain: () => _plain,
    hasSynced: () => !!(_synced && _synced.length > 0),
    onUpdate: (fn) => { _onUpdate = fn; }
  };
})();
