"""flight 航线只读接口测试：seed 幂等 + 全量返回 + 途经点有序"""

from fastapi.testclient import TestClient

from app.main import app
from scripts.seed_flight import main as seed_flight

client = TestClient(app)

seed_flight()  # 导入即确保预置航线存在（幂等，已存在则跳过）


def test_routes_returns_full_data():
    resp = client.get("/api/flight/routes")
    assert resp.status_code == 200
    routes = resp.json()["routes"]
    assert len(routes) >= 3
    for route in routes:
        assert route["id"] and route["name"]
        seqs = [p["seq"] for p in route["points"]]
        assert seqs == sorted(seqs), "途经点应按 seq 升序返回"
        assert all(
            {"lng", "lat", "altitude"} <= p.keys() for p in route["points"]
        )
