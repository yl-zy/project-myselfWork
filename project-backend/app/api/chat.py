"""问答模块：会话 CRUD + SSE 流式问答 + 访客端点 + 限流

契约见《后端数据设计草案》§4.2–4.4、§6.1：
- SSE 事件序列：token（多次）→ sources（0 或 1 次）→ done（含 message_id）
- 流式过程不入库，回答完成后一次性落库；中断则保留已生成部分并标记 interrupted
- 限流走 rate_limit_daily 表（MySQL 持久化，重启不可绕过）
"""

import json
from collections.abc import Iterator
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user
from app.models.chat import ChatMessage, ChatSession
from app.models.user import User
from app.schemas.chat import (
    MessageOut,
    RenameSessionRequest,
    SendMessageRequest,
    SessionOut,
)
from app.services.llm_provider import stream_answer

router = APIRouter(prefix="/chat", tags=["chat"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def sse(event: str, data) -> str:
    """一条 SSE 消息；data 统一 JSON 编码，天然规避文本换行问题"""

    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _check_rate_limit(db: Session, subject: str, limit: int) -> None:
    """原子自增当日计数，超限抛 429。INSERT ON DUPLICATE KEY UPDATE 保证并发安全"""

    db.execute(
        text(
            "INSERT INTO rate_limit_daily (subject, scene, day, count, created_at, updated_at)"
            " VALUES (:subject, 'chat', CURDATE(), 1, NOW(), NOW())"
            " ON DUPLICATE KEY UPDATE count = count + 1, updated_at = NOW()"
        ),
        {"subject": subject},
    )
    count = db.scalar(
        text(
            "SELECT count FROM rate_limit_daily"
            " WHERE subject = :subject AND scene = 'chat' AND day = CURDATE()"
        ),
        {"subject": subject},
    )
    db.commit()
    if count is not None and count > limit:
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMITED", "message": "今日提问次数已用完，明天再来吧"},
        )


def _validate_content(content: str) -> str:
    question = content.strip()
    if not question:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_CONTENT", "message": "提问内容不能为空"},
        )
    if len(question) > 2000:
        raise HTTPException(
            status_code=400,
            detail={"code": "CONTENT_TOO_LONG", "message": "提问内容不能超过 2000 字"},
        )
    return question


def _get_own_session(db: Session, session_id: int, user: User) -> ChatSession:
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.is_deleted == 0
        )
    )
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "SESSION_NOT_FOUND", "message": "会话不存在或已删除"},
        )
    if session.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "无权访问他人会话"},
        )
    return session


# ---------------- 会话 CRUD ----------------


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    """我的会话列表，按 last_active_at 倒序"""

    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user.id, ChatSession.is_deleted == 0)
        .order_by(ChatSession.last_active_at.desc())
    ).all()
    return {
        "sessions": [SessionOut.model_validate(s).model_dump(mode="json") for s in sessions]
    }


@router.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ChatSession:
    """新建空会话，标题留空，首条提问发出后回填前 20 字"""

    session = ChatSession(user_id=user.id, title="", last_active_at=datetime.now())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def rename_session(
    session_id: int,
    body: RenameSessionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatSession:
    session = _get_own_session(db, session_id, user)
    title = body.title.strip()
    if not title or len(title) > 64:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_TITLE", "message": "标题需为 1–64 个字符"},
        )
    session.title = title
    db.commit()
    db.refresh(session)
    return session


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """软删除：消息保留在库中，列表与详情不可见"""

    session = _get_own_session(db, session_id, user)
    session.is_deleted = 1
    db.commit()


@router.get("/sessions/{session_id}/messages")
def list_messages(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """会话全部消息，按 id 升序"""

    _get_own_session(db, session_id, user)
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id)
    ).all()
    return {
        "messages": [MessageOut.model_validate(m).model_dump(mode="json") for m in messages]
    }


# ---------------- 流式问答（SSE） ----------------


def _persist_round(
    db: Session, session: ChatSession, question: str, answer: str, sources, status: str
) -> ChatMessage:
    """一轮问答落库：用户提问 + 助手回答，并刷新会话活跃时间与标题"""

    db.add(
        ChatMessage(session_id=session.id, role="user", content=question, status="done")
    )
    assistant = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer,
        status=status,
        sources=sources,
    )
    db.add(assistant)
    session.last_active_at = datetime.now()
    if not session.title:
        session.title = question[:20]
    db.commit()
    db.refresh(assistant)
    return assistant


def _session_event_stream(session_id: int, question: str) -> Iterator[str]:
    """登录用户的事件流：边生成边推送，结束后落库；客户端中断保留已生成部分

    生成器执行发生在响应发送阶段，请求作用域的 db 可能已被框架回收，
    因此这里自行管理数据库会话。
    """

    db = SessionLocal()
    chunks: list[str] = []
    sources = None
    try:
        for event in stream_answer(question):
            if event["type"] == "token":
                chunks.append(event["data"])
                yield sse("token", event["data"])
            elif event["type"] == "sources":
                sources = event["data"]
                yield sse("sources", sources)
        session = db.get(ChatSession, session_id)
        msg = _persist_round(db, session, question, "".join(chunks), sources, "done")
        yield sse("done", {"message_id": msg.id})
    except GeneratorExit:
        # 客户端中断（前端 abort / 关闭页面）：已生成部分入库并标记 interrupted
        if chunks:
            try:
                session = db.get(ChatSession, session_id)
                _persist_round(
                    db, session, question, "".join(chunks), sources, "interrupted"
                )
            except Exception:
                pass
        raise
    except Exception:
        # 生成中途出错：已生成部分按 interrupted 落库，通道随后断开
        if chunks:
            try:
                session = db.get(ChatSession, session_id)
                _persist_round(
                    db, session, question, "".join(chunks), sources, "interrupted"
                )
            except Exception:
                pass
        raise
    finally:
        db.close()


def _guest_event_stream(question: str) -> Iterator[str]:
    """访客事件流：单轮、不建会话、不落库"""

    for event in stream_answer(question):
        if event["type"] == "token":
            yield sse("token", event["data"])
        elif event["type"] == "sources":
            yield sse("sources", event["data"])
    yield sse("done", {"message_id": None})


@router.post("/sessions/{session_id}/messages")
def send_message(
    session_id: int,
    body: SendMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """在指定会话内提问（登录 + 本人 + 限流），SSE 流式返回"""

    question = _validate_content(body.content)
    _get_own_session(db, session_id, user)
    _check_rate_limit(db, f"user:{user.id}", config.CHAT_RATE_LIMIT_USER)
    return StreamingResponse(
        _session_event_stream(session_id, question),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.post("/guest/messages")
def send_guest_message(
    body: SendMessageRequest, request: Request, db: Session = Depends(get_db)
) -> StreamingResponse:
    """访客提问（公开 + IP 限流）：单轮无上下文，不建会话、不落库"""

    question = _validate_content(body.content)
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(db, f"ip:{client_ip}", config.CHAT_RATE_LIMIT_GUEST)
    return StreamingResponse(
        _guest_event_stream(question),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
