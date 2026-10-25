from datetime import datetime

from sqlalchemy import BigInteger, DateTime, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.core.config import DATABASE_URL


class Base(DeclarativeBase):
    """所有 ORM 模型的基类，Alembic 自动迁移以 Base.metadata 为准"""


class IntPkMixin:
    """统一主键：id BIGINT UNSIGNED AUTO_INCREMENT"""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)


class TimestampMixin:
    """统一时间戳：created_at / updated_at，由数据库自动维护"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), server_onupdate=func.now(), nullable=False
    )


engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI 依赖项：每个请求一个数据库会话，结束自动关闭"""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
