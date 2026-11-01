@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 python，请先安装 Python 3.10 或更高版本。
  pause
  exit /b 1
)

python -c "import fastapi, uvicorn, multipart, qrcode" >nul 2>nul
if errorlevel 1 (
  echo 正在安装依赖，请稍候...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
  )
)

python -m app.main
pause
