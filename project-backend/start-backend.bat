@echo off
rem 后端一键启动：固定在 project-backend 目录 + 固定使用本项目自己的 .venv
cd /d "%~dp0"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8081
pause
