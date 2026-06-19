@echo off
chcp 65001 >nul
title Spotify 歌词液态玻璃 v2.0 — 3D 海浪律动
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  🌊 Spotify 歌词液态玻璃 v2.0                              ║
echo ║  3D 物理海浪 + iOS 液态玻璃 + 音乐律动                     ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: ========================================================================
:: Step 1: 检查 Node.js
:: ========================================================================
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js
    echo.
    echo 请从以下地址下载安装 Node.js (LTS 版本):
    echo   https://nodejs.org
    echo.
    echo 安装完成后重新运行本脚本。
    pause
    exit /b 1
)

echo [1/4] Node.js 版本:
node --version
echo.

:: ========================================================================
:: Step 2: 安装依赖
:: ========================================================================
if not exist "node_modules" (
    echo [2/4] 正在安装项目依赖 (可能需要几分钟)...
    echo       这包括 Electron (~100MB) 和 Three.js
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败，请检查网络连接后重试。
        pause
        exit /b 1
    )
) else (
    echo [2/4] 依赖已存在，跳过安装。
)
echo.

:: ========================================================================
:: Step 3: 检查 Spotify 配置
:: ========================================================================
echo [3/4] 检查配置...
findstr /C:"your_spotify_client_id_here" ".env" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ╔══════════════════════════════════════════════════════════╗
    echo ║  ⚠️  Spotify Client ID 尚未配置                        ║
    echo ║                                                          ║
    echo ║  应用将以 Mock 音频模式启动。                            ║
    echo ║  3D 海浪效果可见，使用模拟音频数据驱动。                 ║
    echo ║                                                          ║
    echo ║  要连接 Spotify 获取真实歌词:                            ║
    echo ║   1. 访问 https://developer.spotify.com/dashboard       ║
    echo ║   2. 创建应用 → 获取 Client ID                          ║
    echo ║   3. 设置 Redirect URI:                                 ║
    echo ║      https://localhost:3000/callback                    ║
    echo ║   4. 将 Client ID 填入 .env 文件                        ║
    echo ╚══════════════════════════════════════════════════════════╝
    echo.
)

:: ========================================================================
:: Step 4: 启动应用
:: ========================================================================
echo [4/4] 正在启动应用...
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  启动后:                                                 ║
echo ║  · 窗口以无边框模式出现                                  ║
echo ║  · 3D 海浪自动以 Mock 数据驱动 (波浪可见)               ║
echo ║  · 点击「连接」按钮授权 Spotify                          ║
echo ║  · 在 Spotify 桌面客户端播放歌曲                         ║
echo ║  · 享受 3D 海浪律动 + 歌词同步                           ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

npx electron .

pause
