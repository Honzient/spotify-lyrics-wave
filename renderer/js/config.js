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

    // 海面网格
    PLANE_SIZE:    60,
    PLANE_SEGMENTS: 256,

    // Gerstner 波浪
    WAVE_COUNT: 8,
    WAVE_STEEPNESS: 0.25,
    WAVE_SPEED_BASE: 1.2,

    // FBM
    FBM_OCTAVES: 4,

    // 渲染
    WATER_DEEP:    [0.0, 0.15, 0.25],
    WATER_SHALLOW: [0.0, 0.35, 0.55],
    WATER_SURFACE: [0.0, 0.55, 0.78],
    FOAM_COLOR:    [0.85, 0.93, 0.98],
    SKY_COLOR:     [0.05, 0.10, 0.18],
    SKY_HORIZON:   [0.4, 0.6, 0.85],

    FRESNEL_POWER: 4.0,
    REFLECTION_STRENGTH: 0.6,
    FOAM_THRESHOLD: 0.5,

    // 音频映射
    BASS_AMP_MAX:  1.2,
    MID_AMP_MAX:   0.4,
    HIGH_FOAM_MAX: 1.0
  },

  UI: {
    GLASS_BLUR_LAYERS: [8, 16, 32, 64],
    GLASS_OPACITY: 0.12
  }
};
Object.freeze(CONFIG);
