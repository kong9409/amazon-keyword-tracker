@echo off
chcp 65001 >nul
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js LTS。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 正在安装依赖，请稍等...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络或 npm 配置。
    pause
    exit /b 1
  )
)
echo 正在启动工具...
echo 打开浏览器访问 http://localhost:8787
call npm start
pause
