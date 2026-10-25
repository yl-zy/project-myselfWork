from datetime import date

from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class RateLimitDaily(Base, IntPkMixin, TimestampMixin):
    """限流计数：MySQL 持久化，服务重启不丢失，防止访客额度被重启绕过"""

    __tablename__ = "rate_limit_daily"

    subject: Mapped[str] = mapped_column(String(80), nullable=False)  # user:{id} | ip:{addr}
    scene: Mapped[str] = mapped_column(String(16), nullable=False)  # P0 只有 chat
    day: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("subject", "scene", "day", name="uq_rate_limit"),)
