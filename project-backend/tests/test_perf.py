"""perf 性能监控测试：批量容错上报 / 分钟限流 / summary 聚合 / errors 分页 / admin 清空 / 过期清理

测试数据统一用 visitor_id 前缀「test-」，用例结束按此前缀清理，不碰真实数据。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core import config
from app.core.database import SessionLocal
from app.main import app
from app.services.perf_clean import cleanup_expired_perf

client = TestClient(app)

VID = "test-perf"


@pytest.fixture(autouse=True)
def clean_test_events():
    yield
    db = SessionLocal()
    try:
        db.execute(
            text("DELETE FROM perf_events WHERE visitor_id LIKE 'test-%'")
        )
        db.commit()
    finally:
        db.close()


def login(username: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    return resp.json()["token"]


def valid_event(**overrides) -> dict:
    event = {
        "event_type": "metric",
        "page": "/chat",
        "name": "LCP",
        "value": 1200.0,
        "visitor_id": VID,
    }
    event.update(overrides)
    return event


def test_report_batch_validates_per_event():
    resp = client.post(
        "/api/perf/events",
        json={
            "events": [
                valid_event(),
                valid_event(name="INP", value=150.0),
                {"event_type": "hack", "page": "/x", "name": "x", "visitor_id": VID},  # 非法类型
                {"event_type": "metric", "page": "/x", "visitor_id": VID},  # 缺 name
                "not-a-dict",
                valid_event(extra={"pad": "x" * 5000}),  # extra 超 4KB
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 2


def test_report_truncates_oversized_batch():
    resp = client.post("/api/perf/events", json={"events": [valid_event() for _ in range(60)]})
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 50  # 单批最多收 50 条


def test_report_never_errors_on_garbage():
    assert client.post("/api/perf/events", content=b"not json").status_code == 200
    assert client.post("/api/perf/events", json={"foo": 1}).json()["accepted"] == 0


def test_report_rate_limited_silently(monkeypatch):
    from app.api import perf as perf_module

    perf_module._rate_window.clear()  # 前面用例在同一分钟内的计数清零，隔离用例
    monkeypatch.setattr(config, "PERF_RATE_LIMIT_PER_MINUTE", 1)
    assert client.post("/api/perf/events", json={"events": [valid_event()]}).json()["accepted"] == 1
    # 超分钟额度：仍返回 200，但静默丢弃
    resp = client.post("/api/perf/events", json={"events": [valid_event()]})
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 0


def test_summary_structure():
    client.post("/api/perf/events", json={"events": [
        valid_event(value=v) for v in (800, 1000, 1200, 2000)
    ] + [valid_event(event_type="api", name="/api/chat", value=230.0)]})
    body = client.get("/api/perf/summary", params={"range": "1d"}).json()
    assert {"metrics", "trend", "pages"} <= body.keys()
    lcp = next(m for m in body["metrics"] if m["name"] == "LCP")
    assert lcp["p75"] == 1200.0  # 4 个值排序后 P75 落在第 3 个（ceil(0.75*4)=3）
    assert lcp["count"] == 4


def test_errors_pagination_and_admin_clear():
    client.post("/api/perf/events", json={"events": [
        valid_event(event_type="error", name="TypeError", value=None,
                    extra={"stack": "demo"}, visitor_id=VID)
        for _ in range(3)
    ]})
    body = client.get("/api/perf/errors", params={"page": 1, "size": 2}).json()
    assert body["total"] >= 3
    assert len(body["list"]) == 2
    assert body["list"][0]["name"] == "TypeError"

    # demo 无权清空，admin 可以
    demo = login("demo", "demo123")
    assert client.delete(
        "/api/perf/events", headers={"Authorization": f"Bearer {demo}"}
    ).status_code == 403
    admin = login("admin", "admin123")
    resp = client.delete("/api/perf/events", headers={"Authorization": f"Bearer {admin}"})
    assert resp.status_code == 200
    assert resp.json()["deleted"] >= 3


def test_cleanup_expired_perf():
    db = SessionLocal()
    try:
        db.execute(
            text(
                "INSERT INTO perf_events (event_type, page, name, visitor_id,"
                " created_at, updated_at) VALUES"
                " ('metric', '/old', 'LCP', 'test-old', '2020-01-01', '2020-01-01')"
            )
        )
        db.commit()
        deleted = cleanup_expired_perf(db, retention_days=7)
        assert deleted >= 1
    finally:
        db.close()
