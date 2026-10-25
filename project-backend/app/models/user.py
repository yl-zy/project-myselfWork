from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class User(Base, IntPkMixin, TimestampMixin):
    """用户表：只有 admin / demo 两个预置账号，不开放注册"""

    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # admin | demo
