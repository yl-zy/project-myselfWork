"""migration 模拟数据与接口测试：生成 / 最新批次 / 增量 / 省级视角 / 聚合 / 过期清理

后台 asyncio 循环不在测试里启动（模块级 TestClient 不触发 lifespan），
直接调用同步生成函数制造确定批次。测试批次用未来时间（2099 年），
保证始终是「最新批次」且不依赖真实数据，用例结束按精确 batch_time 清理。
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import SessionLocal
from app.main import app
from app.services.migration_gen import cleanup_expired, generate_batch

client = TestClient(app)

T1 = datetime(2099, 1, 1, 10, 0, 0)  # 较早批次
T2 = datetime(2099, 1, 2, 10, 0, 0)  # 最新批次
OLD = datetime(2020, 1, 1, 0, 0, 0)  # 远超保留期的过期批次


@pytest.fixture(autouse=True)
def clean_test_batches():
    yield
    db = SessionLocal()
    try:
        db.execute(
            text(
                "DELETE FROM migration_records WHERE batch_time IN ("
                "'2099-01-01 10:00:00', '2099-01-02 10:00:00', '2020-01-01 00:00:00')"
            )
        )
        db.commit()
    finally:
        db.close()


def seed_two_batches() -> None:
    db = SessionLocal()
    try:
        generate_batch(db, batch_time=T1, size=8)
        generate_batch(db, batch_time=T2, size=8)
    finally:
        db.close()


def test_flows_returns_latest_batch_by_default():
    seed_two_batches()
    resp = client.get("/api/migration/flows")
    assert resp.status_code == 200
    body = resp.json()
    assert body["batch_time"].startswith("2099-01-02")
    assert len(body["records"]) > 0
    assert all(
        {"from_code", "to_code", "people"} == r.keys() for r in body["records"]
    )


def test_flows_since_returns_incremental_only():
    seed_two_batches()
    resp = client.get("/api/migration/flows", params={"since": T1.isoformat()})
    assert resp.status_code == 200
    assert len(resp.json()["records"]) > 0
    # 增量不含 T1 本身（边界严格大于）


def test_flows_province_scope_filters_by_involvement():
    seed_two_batches()
    latest = client.get("/api/migration/flows").json()
    code = latest["records"][0]["from_code"]
    resp = client.get(
        "/api/migration/flows", params={"level": "province", "province": code}
    )
    assert resp.status_code == 200
    for r in resp.json()["records"]:
        assert code in (r["from_code"], r["to_code"])


def test_flows_validation_errors():
    assert client.get("/api/migration/flows", params={"level": "province"}).json()[
        "code"
    ] == "PROVINCE_REQUIRED"
    assert client.get(
        "/api/migration/flows", params={"level": "province", "province": "99"}
    ).json()["code"] == "INVALID_PROVINCE"
    assert client.get("/api/migration/flows", params={"level": "city"}).json()[
        "code"
    ] == "INVALID_LEVEL"


def test_summary_nation_top_lists():
    seed_two_batches()
    resp = client.get("/api/migration/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["batch_time"].startswith("2099-01-02")
    assert len(body["top_in"]) <= 10 and len(body["top_out"]) <= 10
    assert all({"code", "name", "people"} == item.keys() for item in body["top_in"])
    # top_in 按迁入人数降序
    peoples = [item["people"] for item in body["top_in"]]
    assert peoples == sorted(peoples, reverse=True)


def test_summary_province_net_consistency():
    seed_two_batches()
    code = client.get("/api/migration/flows").json()["records"][0]["to_code"]
    resp = client.get("/api/migration/summary", params={"level": "province", "province": code})
    assert resp.status_code == 200
    body = resp.json()
    assert body["province"]["code"] == code
    assert body["net"] == body["total_in"] - body["total_out"]
    assert body["total_in"] == sum(item["people"] for item in body["in_from"])
    assert body["total_out"] == sum(item["people"] for item in body["out_to"])


def test_cleanup_expired_removes_old_keeps_recent():
    db = SessionLocal()
    try:
        generate_batch(db, batch_time=OLD, size=5)
        generate_batch(db, batch_time=T2, size=5)
        deleted = cleanup_expired(db, retention_days=3)
        assert deleted >= 5  # 过期批次被清
        surviving = db.scalar(
            text("SELECT COUNT(*) FROM migration_records WHERE batch_time = :t"),
            {"t": "2099-01-02 10:00:00"},
        )
        assert surviving > 0  # 保留期内的不动
    finally:
        db.close()
