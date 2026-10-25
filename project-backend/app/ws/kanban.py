import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.kanban import KanbanCard
from app.models.user import User
from app.schemas.kanban import KanbanCardOut
from app.ws.manager import ConnectionManager, WSClient

router = APIRouter()
manager = ConnectionManager()

VALID_COLUMNS = {"todo", "doing", "done"}
CREATE_GAP = 1000.0  # 新卡片排在列尾，与既有卡片留出间距，方便中值插入


def card_payload(card: KanbanCard) -> dict:
    return KanbanCardOut.model_validate(card).model_dump(mode="json")


def envelope(msg_type: str, payload: dict, sender: str, version: int = 0) -> dict:
    return {"type": msg_type, "payload": payload, "sender": sender, "version": version}


async def reject(websocket: WebSocket, reason: str, card: KanbanCard | None = None) -> None:
    payload: dict = {"reason": reason}
    if card is not None:
        payload["card"] = card_payload(card)
    await websocket.send_json(envelope("op.rejected", payload, "server"))


async def handle_message(client: WSClient, raw: str, db: Session) -> None:
    try:
        msg = json.loads(raw)
        msg_type = msg.get("type")
        payload = msg.get("payload") or {}
    except (json.JSONDecodeError, AttributeError):
        await reject(client.websocket, "BAD_MESSAGE")
        return

    if msg_type == "ping":
        await client.websocket.send_json(envelope("pong", {}, "server"))
        return

    # 写操作统一要求登录，访客只读（PRD 4.1）
    if not client.can_write:
        await reject(client.websocket, "UNAUTHORIZED")
        return

    if msg_type == "card.create":
        title = str(payload.get("title", "")).strip()
        column = payload.get("column", "")
        description = payload.get("description")
        if not (1 <= len(title) <= 50) or column not in VALID_COLUMNS:
            await reject(client.websocket, "INVALID_CARD")
            return
        max_pos = db.scalar(
            select(func.max(KanbanCard.position)).where(KanbanCard.column_name == column)
        )
        card = KanbanCard(
            title=title,
            description=description,
            column_name=column,
            position=(max_pos or 0) + CREATE_GAP,
            updated_by=client.user_id,
            version=1,
        )
        db.add(card)
        db.commit()
        db.refresh(card)
        await manager.broadcast(envelope("card.created", card_payload(card), client.name, card.version))

    elif msg_type == "card.move":
        # 移动/排序：后到者覆盖，不做版本校验（设计文档 §5.3）
        card = db.get(KanbanCard, payload.get("card_id") or 0)
        if card is None:
            await reject(client.websocket, "CARD_NOT_FOUND")
            return
        column = payload.get("column", card.column_name)
        if column not in VALID_COLUMNS:
            await reject(client.websocket, "INVALID_CARD", card)
            return
        card.column_name = column
        card.position = float(payload.get("position", card.position))
        card.updated_by = client.user_id
        card.version += 1
        db.commit()
        await manager.broadcast(envelope("card.moved", card_payload(card), client.name, card.version))

    elif msg_type == "card.update":
        # 内容编辑：base_version 乐观锁校验，过期则拒绝并附最新状态
        card = db.get(KanbanCard, payload.get("card_id") or 0)
        if card is None:
            await reject(client.websocket, "CARD_NOT_FOUND")
            return
        if payload.get("base_version") != card.version:
            await reject(client.websocket, "VERSION_CONFLICT", card)
            return
        title = payload.get("title")
        if title is not None:
            title = str(title).strip()
            if not (1 <= len(title) <= 50):
                await reject(client.websocket, "INVALID_CARD", card)
                return
            card.title = title
        if "description" in payload:
            card.description = payload["description"]
        card.updated_by = client.user_id
        card.version += 1
        db.commit()
        await manager.broadcast(envelope("card.updated", card_payload(card), client.name, card.version))

    elif msg_type == "card.delete":
        card = db.get(KanbanCard, payload.get("card_id") or 0)
        if card is None:
            await reject(client.websocket, "CARD_NOT_FOUND")
            return
        card_id = card.id
        db.delete(card)
        db.commit()
        await manager.broadcast(envelope("card.deleted", {"id": card_id}, client.name))

    else:
        await reject(client.websocket, "UNKNOWN_TYPE")


@router.websocket("/ws/kanban")
async def kanban_ws(
    websocket: WebSocket,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> None:
    await websocket.accept()

    # 身份识别：token 有效为登录用户，否则降级为只读访客（不断开连接）
    user = None
    if token:
        claims = decode_token(token)
        if claims:
            user = db.get(User, int(claims["sub"]))
    if user:
        client = WSClient(websocket=websocket, name=user.username, role=user.role, user_id=user.id)
    else:
        client = WSClient(
            websocket=websocket, name=manager.next_guest_name(), role="guest", user_id=None
        )
    manager.add(client)

    cards = db.scalars(
        select(KanbanCard).order_by(KanbanCard.column_name, KanbanCard.position)
    ).all()
    await websocket.send_json(
        envelope("board.snapshot", {"cards": [card_payload(c) for c in cards]}, "server")
    )
    await manager.broadcast(
        envelope("presence.update", {"online": manager.online_list()}, "server")
    )

    try:
        while True:
            raw = await websocket.receive_text()
            await handle_message(client, raw, db)
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(websocket)
        await manager.broadcast(
            envelope("presence.update", {"online": manager.online_list()}, "server")
        )
