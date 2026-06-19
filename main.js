/**
 * main.js — Electron Main Process
 *
 * 职责:
 *   - 创建无边框透明 BrowserWindow
 *   - 整合 Spotify OAuth (PKCE) 在 Main Process 中处理
 *   - desktopCapturer 系统音频捕获
 *   - 通过 IPC 向 Renderer Process 推送数据
 *   - 应用生命周期管理
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================================
// 全局状态
// ============================================================================
let mainWindow = null;
let spotifyToken = null;
let spotifyTokenExpires = 0;
let spotifyPollTimer = null;
let mockAudioTimer = null;

// Spotify 配置 (从 .env 或默认值读取)
let SPOTIFY_CLIENT_ID = '';
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/SPOTIFY_CLIENT_ID=(.+)/);
    if (match) SPOTIFY_CLIENT_ID = match[1].trim();
  }
} catch (_) {}

// ============================================================================
// BrowserWindow 创建 — 无边框透明窗口
// ============================================================================
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.85),
    height: Math.floor(height * 0.85),
    x: Math.floor(width * 0.075),
    y: Math.floor(height * 0.075),

    // 无边框 + 透明
    frame: false,
    transparent: true,
    hasShadow: false,

    // 始终置顶 (可选, 作为伴随应用浮在 Spotify 上方)
    alwaysOnTop: false,

    // 性能
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webgl: true,
      offscreen: false
    },

    // 窗口样式
    resizable: true,
    minimizable: true,
    skipTaskbar: false,
    title: 'Spotify 歌词液态玻璃',

    // 图标
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // 加载渲染页面
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanup();
  });
}

// ============================================================================
// IPC 处理 — Main ↔ Renderer 通信桥梁
// ============================================================================

// ── 窗口控制 ──────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

// ── Spotify OAuth ─────────────────────────────────────
ipcMain.handle('spotify:start-auth', async () => {
  return startSpotifyAuth();
});

ipcMain.handle('spotify:get-token', () => {
  if (spotifyToken && Date.now() < spotifyTokenExpires - 60000) {
    return { token: spotifyToken, expires: spotifyTokenExpires };
  }
  return null;
});

// ── Spotify API 代理 ──────────────────────────────────
ipcMain.handle('spotify:api-request', async (_event, endpoint, method, body) => {
  if (!spotifyToken || Date.now() >= spotifyTokenExpires) {
    throw new Error('Not authenticated');
  }
  const url = 'https://api.spotify.com/v1' + endpoint;
  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      'Authorization': `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  return res.json();
});

// ── 歌词代理 ──────────────────────────────────────────
ipcMain.handle('lyrics:fetch', async (_event, trackName, artistName, albumName, durationMs) => {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName || '',
    duration: String(Math.round((durationMs || 0) / 1000))
  });
  const url = `https://lrclib.net/api/get?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
});

// ── 音频捕获 ──────────────────────────────────────────
ipcMain.handle('audio:capture-start', async () => {
  return captureSystemAudio();
});

ipcMain.handle('audio:mock-start', async () => {
  startMockAudio();
  return true;
});

ipcMain.handle('audio:mock-stop', async () => {
  stopMockAudio();
  return true;
});

// ── Spotify 播放控制 ──────────────────────────────────
ipcMain.handle('spotify:control', async (_event, action) => {
  if (!spotifyToken) return;
  const endpoints = {
    play:     ['PUT', '/v1/me/player/play'],
    pause:    ['PUT', '/v1/me/player/pause'],
    next:     ['POST', '/v1/me/player/next'],
    previous: ['POST', '/v1/me/player/previous']
  };
  const [method, ep] = endpoints[action] || [];
  if (!ep) return;
  await fetch('https://api.spotify.com/v1' + ep, {
    method,
    headers: { 'Authorization': `Bearer ${spotifyToken}` }
  });
});

// ============================================================================
// Spotify PKCE OAuth (Main Process)
// ============================================================================
const crypto = require('crypto');

function generateCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url').slice(0, 96);
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function startSpotifyAuth() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: 'https://localhost:3000/callback',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: 'user-read-currently-playing user-read-playback-state user-modify-playback-state'
  });

  const authUrl = 'https://accounts.spotify.com/authorize?' + params.toString();

  // 创建授权子窗口
  const authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    title: 'Spotify 授权',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  return new Promise((resolve) => {
    authWindow.loadURL(authUrl);

    // 拦截回调重定向 (阻止实际导航，我们只需提取 code)
    authWindow.webContents.on('will-redirect', async (event, url) => {
      if (url.startsWith('https://localhost:3000/callback')) {
        event.preventDefault(); // 阻止导航到不存在的本地 HTTPS 服务器
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');

        if (code) {
          // 用 code 换取 token
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: SPOTIFY_CLIENT_ID,
              grant_type: 'authorization_code',
              code,
              redirect_uri: 'https://localhost:3000/callback',
              code_verifier: codeVerifier
            })
          });

          const data = await tokenRes.json();
          spotifyToken = data.access_token;
          spotifyTokenExpires = Date.now() + (data.expires_in || 3600) * 1000;

          authWindow.close();
          mainWindow.webContents.send('spotify:auth-complete', true);
          resolve(true);
        } else {
          authWindow.close();
          mainWindow.webContents.send('spotify:auth-complete', false);
          resolve(false);
        }
      }
    });

    authWindow.on('closed', () => {
      mainWindow.webContents.send('spotify:auth-complete', false);
      resolve(false);
    });
  });
}

// ============================================================================
// 系统音频捕获 (desktopCapturer)
// ============================================================================
async function captureSystemAudio() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });

    if (sources.length === 0) {
      mainWindow.webContents.send('audio:capture-error', 'No audio sources found');
      return false;
    }

    // 通过 Renderer 的 getDisplayMedia 获取系统音频
    // desktopCapturer 提供 source id，Renderer 用它在 getDisplayMedia 中请求
    mainWindow.webContents.send('audio:source-ready', sources[0].id);
    return true;
  } catch (err) {
    mainWindow.webContents.send('audio:capture-error', err.message);
    return false;
  }
}

// ============================================================================
// Mock Audio — 模拟正弦波数据 (WSL 调试用)
// ============================================================================
let mockPhase = 0;

function startMockAudio() {
  stopMockAudio();
  // 每 16ms (~60fps) 生成模拟频谱数据
  mockAudioTimer = setInterval(() => {
    mockPhase += 0.016;

    // 模拟一首歌的动态: 不同频段用不同频率 + 振幅的正弦波模拟
    // 叠加多个正弦波产生复杂的频谱形状
    const bassFreq  = 2.0;  // Bass 变化慢
    const midFreq   = 7.0;  // Mid 变化中等
    const highFreq  = 15.0; // High 变化快

    // 模拟音乐有高潮和低谷 (用长周期包络)
    const envelope = 0.5 + 0.5 * Math.sin(mockPhase * 0.3); // ~20秒周期

    const bass  = clamp01(0.3 + 0.7 * envelope * (0.5 + 0.5 * Math.sin(mockPhase * bassFreq)));
    const mid   = clamp01(0.2 + 0.6 * envelope * (0.5 + 0.5 * Math.sin(mockPhase * midFreq + 1.2)));
    const high  = clamp01(0.1 + 0.5 * envelope * (0.5 + 0.5 * Math.sin(mockPhase * highFreq + 2.5)));

    // 模拟突然的爆发 (副歌)
    const chorusBurst = Math.abs(Math.sin(mockPhase * 0.15)) > 0.95 ? 1.0 : 0.0;
    const burstBass  = bass  + chorusBurst * 0.5;
    const burstMid   = mid   + chorusBurst * 0.4;
    const burstHigh  = high  + chorusBurst * 0.6;

    mainWindow?.webContents.send('audio:mock-data', {
      bass:  clamp01(burstBass),
      mid:   clamp01(burstMid),
      high:  clamp01(burstHigh),
      timestamp: mockPhase
    });
  }, 16);
}

function stopMockAudio() {
  if (mockAudioTimer) {
    clearInterval(mockAudioTimer);
    mockAudioTimer = null;
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ============================================================================
// 清理
// ============================================================================
function cleanup() {
  stopMockAudio();
  if (spotifyPollTimer) clearInterval(spotifyPollTimer);
}

// ============================================================================
// 命令行开关
// WSL2: 优先 EGL, 回退 SwiftShader (CPU 软件渲染)
// Windows: Chromium 自动选择最佳 GPU 后端
// ============================================================================
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');

// 检测是否在 WSL 环境
const isWSL = require('fs').existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');
if (isWSL) {
  // WSL2: 使用 EGL 后端 (WSLg 提供), 回退 SwiftShader 软件渲染
  app.commandLine.appendSwitch('use-gl', 'egl');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

// ============================================================================
// 应用生命周期
// ============================================================================
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
