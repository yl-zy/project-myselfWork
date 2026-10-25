# 统一导入所有模型，Alembic 自动迁移依赖这里收集 Base.metadata
from app.models.chat import ChatMessage, ChatSession
from app.models.flight import FlightRoute, FlightRoutePoint
from app.models.kanban import KanbanCard
from app.models.migration import MigrationRecord
from app.models.perf import PerfEvent
from app.models.rate_limit import RateLimitDaily
from app.models.user import User

__all__ = [
    "User",
    "ChatSession",
    "ChatMessage",
    "KanbanCard",
    "FlightRoute",
    "FlightRoutePoint",
    "MigrationRecord",
    "PerfEvent",
    "RateLimitDaily",
]
