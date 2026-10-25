from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.flight import router as flight_router
from app.api.health import router as health_router
from app.api.kanban import router as kanban_router
from app.api.migration import router as migration_router
from app.api.perf import router as perf_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(kanban_router)
api_router.include_router(chat_router)
api_router.include_router(flight_router)
api_router.include_router(migration_router)
api_router.include_router(perf_router)
