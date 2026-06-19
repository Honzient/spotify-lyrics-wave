/**
 * audio-analyzer.js — 音频分析模块 (Renderer Process)
 *
 * 支持两种模式:
 *   - 真实模式: 通过 Web Audio API AnalyserNode 分析系统音频
 *   - Mock 模式: 接收 Main Process 发送的模拟频谱数据 (WSL 调试)
 *
 * 输出: 经 Attack/Release 平滑的 Bass/Mid/High 能量值 (0-1)
 */
const AudioAnalyzer = (() => {
  'use strict';

  let _mode = 'mock'; // 'mock' | 'real'
  let _audioCtx = null, _analyser = null, _fftData = null;
  let _rawBass = 0, _rawMid = 0, _rawHigh = 0;
  let _smBass = 0, _smMid = 0, _smHigh = 0;
  let _active = false;
  let _attackC = 0.28, _releaseC = 0.04, _pauseC = 0.02;
  let _lastTime = performance.now();
  let _onUpdate = null;

  // ── Mock 模式: 接收 Main Process 数据 ──────────────
  function startMock() {
    _mode = 'mock';
    _active = true;
    window.electronAPI.onMockAudioData((data) => {
      _rawBass  = clamp01(data.bass);
      _rawMid   = clamp01(data.mid);
      _rawHigh  = clamp01(data.high);
    });
    window.electronAPI.audioMockStart();
  }

  function stopMock() {
    _active = false;
    window.electronAPI.audioMockStop();
  }

  // ── 真实模式: getDisplayMedia + Web Audio API ─────
  async function startReal(sourceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1 } }
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) { console.error('No audio tracks'); return false; }

      _audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = CONFIG.AUDIO.FFT_SIZE;
      _analyser.smoothingTimeConstant = 0.8;
      const source = _audioCtx.createMediaStreamSource(stream);
      source.connect(_analyser);
      _fftData = new Uint8Array(_analyser.frequencyBinCount);
      _mode = 'real';
      _active = true;

      // 停止视频轨道
      stream.getVideoTracks().forEach(t => t.stop());
      return true;
    } catch (e) {
      console.error('Audio capture failed:', e);
      // 失败时回退到 mock
      startMock();
      return false;
    }
  }

  // ── 频段能量计算 ─────────────────────────────────
  function bandEnergy(data, lowHz, highHz, sampleRate, fftSize) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < data.length; i++) {
      const f = (i * sampleRate) / fftSize;
      if (f >= lowHz && f < highHz) { sum += data[i] / 255; cnt++; }
    }
    return cnt > 0 ? sum / cnt : 0;
  }

  function arSmooth(cur, target, att, rel) {
    return target > cur ? cur + (target - cur) * att : cur + (target - cur) * rel;
  }

  // ── 每帧更新 ─────────────────────────────────────
  function update() {
    const now = performance.now(), dt = Math.max((now - _lastTime) / 1000, 0.001); _lastTime = now;
    const fps = 1 / dt;
    _attackC  = 1 - Math.exp(-dt / CONFIG.AUDIO.ATTACK_TIME_S);
    _releaseC = 1 - Math.exp(-dt / CONFIG.AUDIO.RELEASE_TIME_S);
    _pauseC   = 1 - Math.exp(-dt / CONFIG.AUDIO.PAUSE_DECAY_S);

    if (_mode === 'real' && _analyser) {
      _analyser.getByteFrequencyData(_fftData);
      const sr = _audioCtx.sampleRate, fz = CONFIG.AUDIO.FFT_SIZE;
      const B = CONFIG.AUDIO.BANDS;
      _rawBass  = bandEnergy(_fftData, B.SUB_BASS[0], B.BASS[1], sr, fz);
      _rawMid   = bandEnergy(_fftData, B.LOW_MID[0], B.MID[1], sr, fz);
      _rawHigh  = bandEnergy(_fftData, B.HIGH_MID[0], B.ULTRA_HIGH[1], sr, fz);
    }

    if (!_active) {
      _rawBass = 0; _rawMid = 0; _rawHigh = 0;
      _smBass  = arSmooth(_smBass, 0, _attackC, _pauseC);
      _smMid   = arSmooth(_smMid,  0, _attackC, _pauseC);
      _smHigh  = arSmooth(_smHigh, 0, _attackC, _pauseC);
    } else {
      _smBass = arSmooth(_smBass, clamp01(_rawBass), _attackC, _releaseC);
      _smMid  = arSmooth(_smMid,  clamp01(_rawMid),  _attackC, _releaseC);
      _smHigh = arSmooth(_smHigh, clamp01(_rawHigh), _attackC, _releaseC);
    }

    const r = { bass: _smBass, mid: _smMid, high: _smHigh, raw: { bass: _rawBass, mid: _rawMid, high: _rawHigh }, isActive: _active, fps };
    if (_onUpdate) _onUpdate(r);
    return r;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  return {
    startMock, stopMock, startReal, update,
    getBass: () => _smBass, getMid: () => _smMid, getHigh: () => _smHigh,
    isActive: () => _active,
    onUpdate: (fn) => { _onUpdate = fn; }
  };
})();
