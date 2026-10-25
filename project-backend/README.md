# Project Backend

基于 FastAPI 的 Python 后端，为 `project-web` 前端提供 API。

## 环境要求

- Python 3.11+
- pip

## 安装

在 `project-backend` 目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

## 开发

```powershell
fastapi dev app/main.py
```

服务默认运行在 `http://127.0.0.1:8000`。交互式 API 文档位于
`http://127.0.0.1:8000/docs`。

### API

- `GET /api/health` — 返回服务健康状态

开发服务器默认允许来自 Vite 地址 `http://localhost:5173` 和
`http://127.0.0.1:5173` 的跨域请求。

## 测试与代码检查

```powershell
pytest
ruff check .
ruff format --check .
```

## 项目结构

```text
app/
  api/
    routes.py
    health.py
  main.py
tests/
  test_main.py
pyproject.toml
```
