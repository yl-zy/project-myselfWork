from sqlalchemy import JSON, Double, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class PerfEvent(Base, IntPkMixin, TimestampMixin):
    """性能事件：metric / api / error 三类单表存储，extra 放 JSON 扩展信息"""

    __tablename__ = "perf_events"

    event_type: Mapped[str] = mapped_column(String(16), nullable=False)  # metric|api|error
    page: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)  # 指标名/接口路径/错误类型
    value: Mapped[float | None] = mapped_column(Double, nullable=True)
    extra: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        Index("ix_perf_type_time", "event_type", "created_at"),
        Index("ix_perf_page_name_time", "page", "name", "created_at"),
    )
