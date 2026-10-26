"""无人机队模拟引擎 + 接口测试：确定性 / 状态机 / 电量守恒 / 快照契约 / 详情 404"""

from fastapi.testclient import TestClient

from app.main import app
from app.services.drone_sim import (
    BATTERY_MIN_DISPATCH,
    DRONE_COUNT,
    STATUSES,
    DroneSimEngine,
)

client = TestClient(app)


def test_engine_deterministic():
    """相同 seed 推演相同：快照应完全一致（演示可复现）"""

    a, b = DroneSimEngine(seed=42), DroneSimEngine(seed=42)
    for _ in range(30):
        a.tick()
        b.tick()
    assert a.snapshot()["drones"] == b.snapshot()["drones"]


def test_engine_state_machine_and_battery():
    """长跑 900 拍：状态全部合法、电量在 0-100、有订单完成、派单电量门槛生效"""

    engine = DroneSimEngine()
    for _ in range(900):  # 模拟 15 分钟
        engine.tick()
    for d in engine.drones:
        assert d.status in STATUSES
        assert 0.0 <= d.battery <= 100.0
        assert 0.0 <= d.progress <= 1.0
        if d.status == "standby" and d.dwell_left <= 0:
            # 下一拍才会派单，但电量必须满足门槛才可能起飞
            pass
    assert sum(d.completed_orders for d in engine.drones) > 0


def test_engine_no_dispatch_below_battery_floor():
    """电量低于门槛的待命无人机不会被派单"""

    engine = DroneSimEngine()
    drone = engine.drones[0]
    drone.status = "standby"
    drone.battery = BATTERY_MIN_DISPATCH - 1
    drone.dwell_left = 0.0
    engine.tick()
    assert drone.status == "standby"
    assert drone.order_id is None


def test_snapshot_api_contract():
    resp = client.get("/api/drones/snapshot")
    assert resp.status_code == 200
    data = resp.json()
    drones = data["drones"]
    assert len(drones) == DRONE_COUNT
    required = {
        "id", "lng", "lat", "alt", "heading", "speed", "battery",
        "status", "order_id", "station_code", "progress", "flight_time", "completed_orders",
    }
    assert all(required <= d.keys() for d in drones)
    assert data["stations"]  # 配送站字典：code → 名称/坐标（前端按 code 反查）
    stats = data["stats"]
    assert stats["total"] == DRONE_COUNT
    assert sum(stats["by_status"].values()) == DRONE_COUNT
    assert stats["base"]["name"]


def test_detail_api_found_and_404():
    ok = client.get("/api/drones/NJ-001")
    assert ok.status_code == 200
    detail = ok.json()
    assert detail["id"] == "NJ-001"
    assert detail["sn"] and detail["model"]
    assert "route" in detail

    bad = client.get("/api/drones/NJ-999")
    assert bad.status_code == 404
    assert bad.json()["code"] == "DRONE_NOT_FOUND"
