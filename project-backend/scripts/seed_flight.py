"""预置无人机航线 seed：重复执行安全（按航线名判重，已存在则跳过）

用法：python -m scripts.seed_flight
航线为南京地标点位（WGS84 经纬度 + 相对高度米），供 Cesium 三维模块演示。
"""

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.flight import FlightRoute, FlightRoutePoint

PRESET_ROUTES = [
    {
        "name": "玄武湖—紫金山巡检线",
        "points": [
            (118.7969, 32.0726, 120),  # 玄武湖
            (118.7955, 32.0595, 150),  # 鸡鸣寺
            (118.8475, 32.0675, 320),  # 紫金山天文台
            (118.8532, 32.0584, 350),  # 中山陵
        ],
    },
    {
        "name": "长江岸线巡查线",
        "points": [
            (118.7088, 32.0056, 100),  # 南京眼步行桥
            (118.7260, 32.0200, 130),  # 绿博园
            (118.7250, 32.0380, 120),  # 江心洲
            (118.7013, 31.9770, 150),  # 鱼嘴湿地公园
        ],
    },
    {
        "name": "老城文化环线",
        "points": [
            (118.7924, 32.0207, 80),   # 夫子庙
            (118.7753, 32.0084, 100),  # 中华门
            (118.7837, 32.0416, 110),  # 新街口
            (118.8001, 32.0430, 100),  # 总统府
            (118.7935, 32.0652, 90),   # 玄武门
        ],
    },
]


def main() -> None:
    db = SessionLocal()
    try:
        for item in PRESET_ROUTES:
            exists = db.scalar(
                select(FlightRoute).where(FlightRoute.name == item["name"])
            )
            if exists:
                print(f"skip: {item['name']} 已存在")
                continue
            route = FlightRoute(name=item["name"], is_preset=1)
            db.add(route)
            db.flush()  # 先拿到 route.id 供途经点引用
            for seq, (lng, lat, altitude) in enumerate(item["points"], start=1):
                db.add(
                    FlightRoutePoint(
                        route_id=route.id, seq=seq, lng=lng, lat=lat, altitude=altitude
                    )
                )
            print(f"created: {item['name']}（{len(item['points'])} 个途经点）")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
