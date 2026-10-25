import os

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import api_router
from app.ws.kanban import router as kanban_ws_router

default_origins = "http://localhost:5173,http://127.0.0.1:5173"
cors_origins = [
    origin.strip()
    for origin in os.getenv("BACKEND_CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]

app = FastAPI(
    title="Project Backend",
    description="API service for project-myselfWork",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(kanban_ws_router)  # WebSocket 通道：/ws/kanban


@app.exception_handler(FastAPIHTTPException)
def http_exception_handler(request: Request, exc: FastAPIHTTPException) -> JSONResponse:
    """统一错误格式为 {code, message}，去掉 FastAPI 默认的 detail 包裹"""

    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "HTTP_ERROR", "message": str(exc.detail)},
    )
