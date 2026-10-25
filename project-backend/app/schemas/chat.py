from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SessionOut(BaseModel):
    id: int
    title: str
    last_active_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class RenameSessionRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    # 长度与空白校验在端点内手动做，返回契约规定的 400 错误码而非 422
    content: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    status: str
    sources: list[Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
