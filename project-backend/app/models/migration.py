from datetime import datetime

from sqlalchemy import CHAR, DateTime, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class MigrationRecord(Base, IntPkMixin, TimestampMixin):
    """人口流动模拟数据：后台任务每 30 秒生成一批，前端带 since 参数轮询增量"""

    __tablename__ = "migration_records"

    # 省级行政区划码（GB/T 2260 前两位），码表作为常量放后端代码，不建表
    from_code: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    to_code: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    people: Mapped[int] = mapped_column(Integer, nullable=False)
    batch_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    __table_args__ = (Index("ix_migration_batch_time", "batch_time"),)
