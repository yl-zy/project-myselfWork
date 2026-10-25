from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.mysql import MEDIUMTEXT, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class ChatSession(Base, IntPkMixin, TimestampMixin):
    """问答会话：归账号所有，软删除"""

    __tablename__ = "chat_sessions"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    is_deleted: Mapped[int] = mapped_column(TINYINT, nullable=False, default=0)

    __table_args__ = (
        Index("ix_chat_sessions_user_list", "user_id", "is_deleted", "last_active_at"),
    )


class ChatMessage(Base, IntPkMixin, TimestampMixin):
    """问答消息：流式过程不入库，完成后一次性落库；中断则保留已生成部分"""

    __tablename__ = "chat_messages"

    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(MEDIUMTEXT, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="done"
    )  # streaming | done | interrupted
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (Index("ix_chat_messages_session", "session_id", "id"),)
