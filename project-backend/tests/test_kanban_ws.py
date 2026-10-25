"""看板 WebSocket 端到端测试：快照下发 / 访客只读 / 变更广播 / 版本冲突

依赖本地 MySQL 与已 seed 的 demo 账号；测试产生的卡片会在用例内删除。
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(username: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["token"]


def test_cards_snapshot_rest():
    resp = client.get("/api/kanban/cards")
    assert resp.status_code == 200
    assert "cards" in resp.json()


def test_kanban_ws_flow():
    token = login("demo", "demo123")

    # 访客连接：能收快照，写操作被拒
    with client.websocket_connect("/ws/kanban") as guest:
        assert guest.receive_json()["type"] == "board.snapshot"
        assert guest.receive_json()["type"] == "presence.update"
        guest.send_json({"type": "card.create", "payload": {"title": "x", "column": "todo"}})
        rejected = guest.receive_json()
        assert rejected["type"] == "op.rejected"
        assert rejected["payload"]["reason"] == "UNAUTHORIZED"

    # 登录用户连接：创建 → 广播 → 编辑版本冲突 → 删除
    with client.websocket_connect(f"/ws/kanban?token={token}") as ws:
        assert ws.receive_json()["type"] == "board.snapshot"
        assert ws.receive_json()["type"] == "presence.update"

        ws.send_json(
            {"type": "card.create", "payload": {"title": "测试卡片", "column": "todo"}}
        )
        created = ws.receive_json()
        assert created["type"] == "card.created"
        card = created["payload"]
        assert card["column_name"] == "todo" and card["version"] == 1

        ws.send_json(
            {
                "type": "card.update",
                "payload": {"card_id": card["id"], "title": "改名", "base_version": 1},
            }
        )
        updated = ws.receive_json()
        assert updated["type"] == "card.updated"
        assert updated["payload"]["version"] == 2

        # 拿着过期版本号再编辑 → 版本冲突，返回最新卡片
        ws.send_json(
            {
                "type": "card.update",
                "payload": {"card_id": card["id"], "title": "覆盖", "base_version": 1},
            }
        )
        conflict = ws.receive_json()
        assert conflict["type"] == "op.rejected"
        assert conflict["payload"]["reason"] == "VERSION_CONFLICT"
        assert conflict["payload"]["card"]["title"] == "改名"

        ws.send_json({"type": "card.delete", "payload": {"card_id": card["id"]}})
        assert ws.receive_json()["type"] == "card.deleted"
