/**
 * app.js — 主渲染进程编排器 (简化版：仅 3D 海浪 + Mock 音频)
 *
 * 暂时剥离 Spotify 联动，确保 3D 海洋在任何环境下都能直接渲染。
 */

(function() {
  'use strict';

  // =========================================================================
  // 初始化
  // =========================================================================
  async function init() {
    console.log('🌊 3D 物理海洋引擎 — 启动 (Mock 模式)');

    UI.init();

    // 1. 初始化 3D 场景 (512² 网格 + Bloom)
    const canvas = document.getElementById('ocean-canvas');
    if (!OceanScene.init(canvas)) {
      console.error('❌ 3D 场景初始化失败');
      return;
    }

    // 2. ★ 强制启动 Mock 音频 (正弦波发生器)
    AudioAnalyzer.startMock();
    console.log('🎵 Mock 音频已启动');

    // 3. ★ 立即启动渲染循环
    OceanScene.start();
    console.log('🌊 3D 海浪渲染已启动');

    // 4. 显示音频指示器 UI
    UI.showAudioIndicator(true);
    UI.showControls(false); // 隐藏播放控件 (无 Spotify)

    // 5. 更新状态栏
    UI.setSpotifyConnected(false);
    // 隐藏连接按钮和歌词区
    document.getElementById('spotify-status').querySelector('.glass-btn-small').style.display = 'none';
    document.getElementById('status-text').textContent = 'Mock 音频模式';
    document.getElementById('status-dot').className = 'status-dot connected';

    // 6. 主循环 (音频分析 + UI 条)
    _mainLoop();

    // 7. 窗口大小调整
    window.addEventListener('resize', () => {
      OceanScene.resize(window.innerWidth, window.innerHeight);
    });

    console.log('✅ 3D 海洋引擎就绪 — Bloom 辉光已启用');
  }

  // =========================================================================
  // 主循环
  // =========================================================================
  function _mainLoop() {
    const energy = AudioAnalyzer.update();
    if (energy && energy.isActive) {
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
