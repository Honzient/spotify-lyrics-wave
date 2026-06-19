/**
 * preload.js — Electron Preload Script
 *
 * 通过 contextBridge 安全地向 Renderer Process 暴露 IPC API。
 * Renderer 使用 window.electronAPI 调用 Main Process 功能。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 窗口控制 ────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close:    () => ipcRenderer.invoke('window:close'),

  // ── Spotify OAuth ───────────────────────────────────
  spotifyStartAuth: () => ipcRenderer.invoke('spotify:start-auth'),
  spotifyGetToken:  () => ipcRenderer.invoke('spotify:get-token'),
  spotifyApiRequest: (endpoint, method, body) =>
    ipcRenderer.invoke('spotify:api-request', endpoint, method, body),
  spotifyControl: (action) => ipcRenderer.invoke('spotify:control', action),

  // ── 歌词 ────────────────────────────────────────────
  lyricsFetch: (trackName, artistName, albumName, durationMs) =>
    ipcRenderer.invoke('lyrics:fetch', trackName, artistName, albumName, durationMs),

  // ── 音频捕获 ────────────────────────────────────────
  audioCaptureStart: () => ipcRenderer.invoke('audio:capture-start'),
  audioMockStart:    () => ipcRenderer.invoke('audio:mock-start'),
  audioMockStop:     () => ipcRenderer.invoke('audio:mock-stop'),

  // ── 事件监听 (Main → Renderer) ──────────────────────
  onSpotifyAuthComplete: (callback) => {
    ipcRenderer.on('spotify:auth-complete', (_event, success) => callback(success));
  },
  onAudioSourceReady: (callback) => {
    ipcRenderer.on('audio:source-ready', (_event, sourceId) => callback(sourceId));
  },
  onAudioCaptureError: (callback) => {
    ipcRenderer.on('audio:capture-error', (_event, msg) => callback(msg));
  },
  onMockAudioData: (callback) => {
    ipcRenderer.on('audio:mock-data', (_event, data) => callback(data));
  }
});
