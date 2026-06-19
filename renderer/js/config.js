/**
 * config.js — 全局配置 (Renderer Process)
 */
const CONFIG = {

  SPOTIFY: {
    POLL_INTERVAL_MS: 1000,
    AUDIO_FEATURES_CACHE_SIZE: 50
  },

  AUDIO: {
    FFT_SIZE: 2048,
    BANDS: {
      SUB_BASS:  [20,   60],
      BASS:      [60,   250],
      LOW_MID:   [250,  500],
      MID:       [500,  2000],
      HIGH_MID:  [2000, 4000],
      HIGH:      [4000, 8000],
      ULTRA_HIGH:[8000, 20000]
    },
    ATTACK_TIME_S:  0.05,
    RELEASE_TIME_S: 0.4,
    PAUSE_DECAY_S:  2.5
  },

  OCEAN: {
    // 相机参数 (沙滩视角)
    CAMERA_POS:    [0, 3.5, 8],
    CAMERA_LOOK:   [0, 1.5, -8],
    CAMERA_FOV:    60,
    CAMERA_NEAR:   0.5,
    CAMERA_FAR:    80,

    // 海面网格 (高分辨率 AAA 级)
    PLANE_SIZE:    64,
    PLANE_SEGMENTS: 512,

    // Bloom 后处理
    BLOOM_STRENGTH: 0.7,
    BLOOM_RADIUS:   0.5,
    BLOOM_THRESHOLD: 0.6,

    // 曝光
    TONE_MAPPING_EXPOSURE: 1.3,
  },

  UI: {
    GLASS_BLUR_LAYERS: [8, 16, 32, 64],
    GLASS_OPACITY: 0.12
  }
};
Object.freeze(CONFIG);
