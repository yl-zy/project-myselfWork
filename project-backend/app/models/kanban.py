from sqlalchemy import BigInteger, Double, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class KanbanCard(Base, IntPkMixin, TimestampMixin):
    """看板卡片：P0 全局单看板，固定三列（todo/doing/done），不设 boards 表"""

    __tablename__ = "kanban_cards"

    title: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    column_name: Mapped[str] = mapped_column(String(16), nullable=False)
    # 列内排序：插入两张卡片之间时取两者中值，避免整列重排
    position: Mapped[float] = mapped_column(Double, nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 乐观锁：每次变更 +1，编辑类操作做 base_version 校验
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)

    __table_args__ = (Index("ix_kanban_column_pos", "column_name", "position"),)
