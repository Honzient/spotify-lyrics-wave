@echo off
chcp 65001 >nul
title 打包 Spotify 歌词液态玻璃 — Windows .exe
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  打包 Spotify 歌词液态玻璃 v2.0                          ║
echo ║  输出: 单文件 Windows .exe (免安装)                      ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 需要 Node.js 来打包应用。
    pause
    exit /b 1
)

echo [1/3] 确保依赖已安装...
if not exist "node_modules" call npm install

echo [2/3] 开始构建 Windows 便携版 .exe...
echo       这可能需要 5-10 分钟...
npx electron-builder --win portable

echo.
echo [3/3] 打包完成!
echo.
echo 输出文件在 dist\ 目录中:
dir /b dist\*.exe 2>nul
echo.
echo 将此 .exe 文件复制到任意位置，双击即可运行。
echo 无需安装 Node.js 或任何依赖！

pause
