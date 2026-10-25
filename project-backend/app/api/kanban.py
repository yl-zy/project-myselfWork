from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.kanban import KanbanCard
from app.schemas.kanban import KanbanCardOut

router = APIRouter(prefix="/kanban", tags=["kanban"])


@router.get("/cards")
def list_cards(db: Session = Depends(get_db)) -> dict:
    """全量看板快照（公开）：首屏加载与 WS 断线重连恢复都用它"""

    cards = db.scalars(
        select(KanbanCard).order_by(KanbanCard.column_name, KanbanCard.position)
    ).all()
    return {"cards": [KanbanCardOut.model_validate(c).model_dump(mode="json") for c in cards]}
