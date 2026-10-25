from datetime import datetime

from pydantic import BaseModel


class KanbanCardOut(BaseModel):
    id: int
    title: str
    description: str | None
    column_name: str
    position: float
    version: int
    updated_by: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}
