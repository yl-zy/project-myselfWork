"""问答模块端到端测试：会话 CRUD / SSE 流式问答 / 访客端点 / 限流

依赖本地 MySQL 与已 seed 的 demo/admin 账号；测试产生的会话在用例内软删除，
限流计数（user:demo、ip:testclient）在 fixture 里清理，避免消耗正式额度。
"""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core import config
from app.core.database import SessionLocal
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_rate_limit():
    yield
    db = SessionLocal()
    try:
        demo_id = db.scalar(text("SELECT id FROM users WHERE username = 'demo'"))
        subjects = ["ip:testclient"]
        if demo_id is not None:
            subjects.append(f"user:{demo_id}")
        for subject in subjects:
            db.execute(
                text("DELETE FROM rate_limit_daily WHERE scene = 'chat' AND subject = :s"),
                {"s": subject},
            )
        db.commit()
    finally:
        db.close()


def login(username: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def parse_sse(raw: str) -> list[dict]:
    events = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        ev = {}
        for line in block.splitlines():
            if line.startswith("event: "):
                ev["event"] = line[7:]
            elif line.startswith("data: "):
                ev["data"] = json.loads(line[6:])
        events.append(ev)
    return events


def post_sse(url: str, payload: dict, headers: dict | None = None):
    with client.stream("POST", url, json=payload, headers=headers or {}) as resp:
        body = "".join(resp.iter_text())
        return resp, parse_sse(body)


def test_session_crud_and_ownership():
    demo = login("demo", "demo123")
    admin = login("admin", "admin123")

    # 建会话 → 列表可见
    resp = client.post("/api/chat/sessions", headers=auth(demo))
    assert resp.status_code == 201
    session_id = resp.json()["id"]
    assert resp.json()["title"] == ""

    sessions = client.get("/api/chat/sessions", headers=auth(demo)).json()["sessions"]
    assert any(s["id"] == session_id for s in sessions)

    # 重命名
    resp = client.patch(
        f"/api/chat/sessions/{session_id}", json={"title": "面试复习"}, headers=auth(demo)
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "面试复习"

    # 非本人访问：403
    resp = client.get(f"/api/chat/sessions/{session_id}/messages", headers=auth(admin))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"

    # 软删除后列表消失、详情 404
    assert client.delete(f"/api/chat/sessions/{session_id}", headers=auth(demo)).status_code == 204
    sessions = client.get("/api/chat/sessions", headers=auth(demo)).json()["sessions"]
    assert all(s["id"] != session_id for s in sessions)
    resp = client.get(f"/api/chat/sessions/{session_id}/messages", headers=auth(demo))
    assert resp.status_code == 404
    assert resp.json()["code"] == "SESSION_NOT_FOUND"


def test_chat_sse_flow_persists_round():
    token = login("demo", "demo123")
    session_id = client.post("/api/chat/sessions", headers=auth(token)).json()["id"]

    resp, events = post_sse(
        f"/api/chat/sessions/{session_id}/messages",
        {"content": "事件循环是什么？"},
        auth(token),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    kinds = [e["event"] for e in events]
    assert kinds[0] == "token" and kinds[-1] == "done"
    assert "sources" in kinds  # 命中知识库条目
    assert kinds.index("sources") == len(kinds) - 2  # sources 在 done 之前

    answer = "".join(e["data"] for e in events if e["event"] == "token")
    assert "微任务" in answer
    sources = next(e["data"] for e in events if e["event"] == "sources")
    assert any("事件循环" in s["title"] for s in sources)
    message_id = events[-1]["data"]["message_id"]
    assert isinstance(message_id, int)

    # 落库：一问一答两条，标题回填前 20 字
    messages = client.get(
        f"/api/chat/sessions/{session_id}/messages", headers=auth(token)
    ).json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["id"] == message_id
    assert messages[1]["status"] == "done"
    assert messages[1]["content"] == answer
    session = client.get("/api/chat/sessions", headers=auth(token)).json()["sessions"][0]
    assert session["title"] == "事件循环是什么？"

    client.delete(f"/api/chat/sessions/{session_id}", headers=auth(token))


def test_guest_chat_sse_not_persisted():
    resp, events = post_sse("/api/chat/guest/messages", {"content": "Vue3 响应式原理"})
    assert resp.status_code == 200
    kinds = [e["event"] for e in events]
    assert kinds[0] == "token" and kinds[-1] == "done"
    assert "sources" in kinds
    assert events[-1]["data"]["message_id"] is None  # 访客不落库

    answer = "".join(e["data"] for e in events if e["event"] == "token")
    assert "Proxy" in answer


def test_empty_content_rejected():
    token = login("demo", "demo123")
    session_id = client.post("/api/chat/sessions", headers=auth(token)).json()["id"]
    resp = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={"content": "   "},
        headers=auth(token),
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "EMPTY_CONTENT"
    client.delete(f"/api/chat/sessions/{session_id}", headers=auth(token))


def test_guest_rate_limited(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_LIMIT_GUEST", 1)
    assert client.post("/api/chat/guest/messages", json={"content": "闭包"}).status_code == 200
    resp = client.post("/api/chat/guest/messages", json={"content": "闭包"})
    assert resp.status_code == 429
    assert resp.json()["code"] == "RATE_LIMITED"
