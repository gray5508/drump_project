@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 鼓谱语音交互测试
python -c "import aiohttp" >nul 2>&1
if errorlevel 1 (
  echo 首次启动正在安装实时语音组件，请稍候...
  python -m pip install --user -r requirements.txt
)
python server.py
if errorlevel 1 (
  echo.
  echo 启动失败，请确认电脑已安装 Python 3。
  pause
)
