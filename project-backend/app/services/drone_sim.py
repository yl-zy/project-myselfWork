"""南京物流无人机队模拟引擎（设计草案 §3.5）

场景设定：新街口物流基站下辖 200 台物流无人机，在南京主城区执行配送任务。
每台无人机按状态机循环：standby 待命 → takeoff 起飞 → delivering 送货
→ landing 降落投递 → returning 返航 → charging 充电 → standby。

纯内存推演、不落库：重启即重新开始，演示场景可接受（原"飞行状态不落库"决策的延续）。
tick() 是同步函数，测试可直接调用；async 循环由 main.py lifespan 挂为 asyncio 任务。
类比前端：相当于一个跑在后端进程里的 setInterval 游戏循环（game loop）。
"""

import asyncio
import math
import random
import time
from dataclasses import dataclass

# ---- 场景常量 ----
BASE_LNG = 118.796  # 物流基站：南京新街口
BASE_LAT = 32.06
DRONE_COUNT = 200
STATION_COUNT = 48
# 南京主城区配送范围（经纬度包围盒）
AREA_LNG = (118.62, 118.98)
AREA_LAT = (31.96, 32.13)

TICK_SECONDS = 1.0

# 飞行参数
CRUISE_ALT_RANGE = (80.0, 130.0)  # 巡航高度（米）
SPEED_RANGE = (13.0, 19.0)  # 巡航地速（m/s）
CLIMB_RATE = 4.0  # 爬升速度 m/s
DESCEND_RATE = 3.5  # 下降速度 m/s
ARRIVE_TOLERANCE_M = 25.0  # 水平到点容差
BATTERY_DRAIN_PER_SEC = 0.055  # 飞行每秒耗电 %
BATTERY_CHARGE_PER_SEC = 1.1  # 充电每秒回电 %
BATTERY_MIN_DISPATCH = 60.0  # 低于该电量不派单
BATTERY_CHARGE_FULL = 95.0  # 充到该值结束充电
DROP_DWELL_SECONDS = (2.0, 5.0)  # 落地投递停留时长
STANDBY_REST_SECONDS = (2.0, 8.0)  # 待命随机休息时长

M_PER_DEG_LAT = 110540.0
DRONE_MODEL = "天羚 TL-200"

STATUSES = ("standby", "takeoff", "delivering", "landing", "returning", "charging")


def _m_per_deg_lng(lat: float) -> float:
    return 111320.0 * math.cos(math.radians(lat))


def _dist_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    dx = (lng2 - lng1) * _m_per_deg_lng((lat1 + lat2) / 2)
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    return math.hypot(dx, dy)


@dataclass
class Station:
    code: str
    name: str
    lng: float
    lat: float


@dataclass
class Drone:
    id: str
    sn: str
    cruise_speed: float
    cruise_alt: float
    lng: float = BASE_LNG
    lat: float = BASE_LAT
    alt: float = 0.0
    heading: float = 0.0  # 地理航向角，0=正北，顺时针
    speed: float = 0.0
    battery: float = 100.0
    status: str = "standby"
    order_id: str | None = None
    station: Station | None = None
    progress: float = 0.0  # 当前订单进度 0-1
    flight_time: float = 0.0  # 当前订单累计飞行秒
    completed_orders: int = 0
    leg_flown: float = 0.0  # 当前订单已飞距离 m
    trip_total: float = 0.0  # 当前订单往返总距离 m
    dwell_left: float = 0.0  # 当前状态剩余停留秒数


class DroneSimEngine:
    """无人机队状态机推演引擎。seed 固定时全程确定性，便于测试与演示复现"""

    def __init__(self, seed: int = 42) -> None:
        self._rng = random.Random(seed)
        self._order_seq = 0
        self.stations: list[Station] = self._build_stations()
        self.drones: list[Drone] = self._build_fleet()

    # ---- 初始化 ----

    def _build_stations(self) -> list[Station]:
        return [
            Station(
                code=f"ST-{i + 1:02d}",
                name=f"配送站-{i + 1:02d}",
                lng=self._rng.uniform(*AREA_LNG),
                lat=self._rng.uniform(*AREA_LAT),
            )
            for i in range(STATION_COUNT)
        ]

    def _build_fleet(self) -> list[Drone]:
        """建队时即铺开状态分布：约 3/5 在飞、1/5 充电、1/5 待命，开机就有完整场面"""

        drones: list[Drone] = []
        for i in range(DRONE_COUNT):
            d = Drone(
                id=f"NJ-{i + 1:03d}",
                sn=f"TL200-26{i + 1:04d}",
                cruise_speed=round(self._rng.uniform(*SPEED_RANGE), 1),
                cruise_alt=round(self._rng.uniform(*CRUISE_ALT_RANGE), 0),
            )
            bucket = i % 5
            if bucket == 0:
                d.status = "charging"
                d.battery = round(self._rng.uniform(30, 88), 1)
            elif bucket == 1:
                d.status = "standby"
                d.battery = round(self._rng.uniform(70, 100), 1)
                d.dwell_left = self._rng.uniform(*STANDBY_REST_SECONDS)
            else:
                self._dispatch(d)
                t = self._rng.uniform(0.1, 0.9)
                if bucket in (2, 3):  # 去程途中
                    d.status = "delivering"
                    d.lng = BASE_LNG + (d.station.lng - BASE_LNG) * t  # type: ignore[union-attr]
                    d.lat = BASE_LAT + (d.station.lat - BASE_LAT) * t  # type: ignore[union-attr]
                    d.leg_flown = d.trip_total / 2 * t
                    d.heading = self._bearing(d.lng, d.lat, d.station.lng, d.station.lat)  # type: ignore[union-attr]
                else:  # 返程途中
                    d.status = "returning"
                    d.lng = d.station.lng + (BASE_LNG - d.station.lng) * t  # type: ignore[union-attr]
                    d.lat = d.station.lat + (BASE_LAT - d.station.lat) * t  # type: ignore[union-attr]
                    d.leg_flown = d.trip_total / 2 + d.trip_total / 2 * t
                    d.heading = self._bearing(d.lng, d.lat, BASE_LNG, BASE_LAT)
                d.alt = d.cruise_alt
                d.speed = d.cruise_speed
                d.battery = round(self._rng.uniform(40, 90), 1)
                d.flight_time = d.leg_flown / d.cruise_speed
                d.progress = min(1.0, d.leg_flown / d.trip_total)
            drones.append(d)
        return drones

    # ---- 推演 ----

    def tick(self, dt: float = TICK_SECONDS) -> None:
        for d in self.drones:
            self._tick_drone(d, dt)

    def _tick_drone(self, d: Drone, dt: float) -> None:
        if d.status in ("takeoff", "delivering", "landing", "returning"):
            d.flight_time += dt
            # 速度越快耗电略高
            d.battery = max(
                0.0, d.battery - BATTERY_DRAIN_PER_SEC * (d.cruise_speed / 16.0) * dt
            )

        if d.status == "standby":
            d.speed = 0.0
            d.dwell_left -= dt
            if d.dwell_left <= 0 and d.battery >= BATTERY_MIN_DISPATCH:
                self._dispatch(d)
                d.status = "takeoff"

        elif d.status == "takeoff":
            d.speed = 0.0
            d.alt = min(d.alt + CLIMB_RATE * dt, d.cruise_alt)
            if d.alt >= d.cruise_alt:
                d.status = "delivering"
                d.speed = d.cruise_speed

        elif d.status == "delivering":
            assert d.station is not None
            if self._fly_toward(d, d.station.lng, d.station.lat, dt):
                d.status = "landing"
                d.speed = 0.0
                d.dwell_left = self._rng.uniform(*DROP_DWELL_SECONDS)

        elif d.status == "landing":
            d.speed = 0.0
            if d.alt > 0:
                d.alt = max(0.0, d.alt - DESCEND_RATE * dt)
            else:
                d.dwell_left -= dt
                if d.dwell_left <= 0:
                    d.status = "returning"

        elif d.status == "returning":
            if self._fly_toward(d, BASE_LNG, BASE_LAT, dt):
                # 到达基站上空后垂直降落
                d.speed = 0.0
                d.alt = max(0.0, d.alt - DESCEND_RATE * dt)
                if d.alt <= 0:
                    d.completed_orders += 1
                    d.status = "charging"
                    d.order_id = None
                    d.station = None
                    d.progress = 0.0
                    d.flight_time = 0.0
                    d.leg_flown = 0.0
                    d.trip_total = 0.0
            elif d.alt < d.cruise_alt:
                # 返航平飞同时爬升到巡航高度
                d.alt = min(d.alt + CLIMB_RATE * dt, d.cruise_alt)

        elif d.status == "charging":
            d.speed = 0.0
            d.battery = min(100.0, d.battery + BATTERY_CHARGE_PER_SEC * dt)
            if d.battery >= BATTERY_CHARGE_FULL:
                d.status = "standby"
                d.dwell_left = self._rng.uniform(*STANDBY_REST_SECONDS)

        if d.trip_total > 0:
            d.progress = min(1.0, d.leg_flown / d.trip_total)

    def _fly_toward(self, d: Drone, t_lng: float, t_lat: float, dt: float) -> bool:
        """朝目标点平飞一步，返回是否到达（25m 容差）"""

        dx = (t_lng - d.lng) * _m_per_deg_lng(d.lat)
        dy = (t_lat - d.lat) * M_PER_DEG_LAT
        dist = math.hypot(dx, dy)
        step = d.cruise_speed * dt
        if dist <= max(step, ARRIVE_TOLERANCE_M):
            d.leg_flown += dist
            d.lng, d.lat = t_lng, t_lat
            return True
        d.heading = math.degrees(math.atan2(dx, dy)) % 360
        d.lng += (dx / dist) * step / _m_per_deg_lng(d.lat)
        d.lat += (dy / dist) * step / M_PER_DEG_LAT
        d.leg_flown += step
        d.speed = d.cruise_speed
        return False

    @staticmethod
    def _bearing(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
        dx = (lng2 - lng1) * _m_per_deg_lng((lat1 + lat2) / 2)
        dy = (lat2 - lat1) * M_PER_DEG_LAT
        return math.degrees(math.atan2(dx, dy)) % 360

    def _dispatch(self, d: Drone) -> None:
        """派单：随机选一个配送站，生成订单与往返里程口径"""

        self._order_seq += 1
        d.order_id = f"ORD-{self._order_seq:05d}"
        d.station = self._rng.choice(self.stations)
        d.trip_total = _dist_m(BASE_LNG, BASE_LAT, d.station.lng, d.station.lat) * 2
        d.leg_flown = 0.0
        d.flight_time = 0.0
        d.progress = 0.0

    # ---- 输出 ----

    def snapshot(self) -> dict:
        """全队快照：200 台摘要 + 配送站字典 + 机队统计（前端 2s 轮询一次）

        载荷优化：配送站坐标在全队级别只发一份（drone 里只带 station_code 反查），
        并把坐标截断到 6 位小数（约 0.1m 精度），显著压缩海外链路传输体积。
        """

        items = [self._drone_brief(d) for d in self.drones]
        by_status: dict[str, int] = {}
        for d in self.drones:
            by_status[d.status] = by_status.get(d.status, 0) + 1
        stations = {
            s.code: {"name": s.name, "lng": round(s.lng, 6), "lat": round(s.lat, 6)}
            for s in self.stations
        }
        return {
            "drones": items,
            "stations": stations,
            "stats": {
                "total": len(self.drones),
                "by_status": by_status,
                "avg_battery": round(sum(d.battery for d in self.drones) / len(self.drones), 1),
                "completed_orders": sum(d.completed_orders for d in self.drones),
                "active_orders": sum(1 for d in self.drones if d.order_id),
                "base": {"lng": BASE_LNG, "lat": BASE_LAT, "name": "新街口物流基站"},
            },
            "ts": int(time.time()),
        }

    def detail(self, drone_id: str) -> dict | None:
        """单机详情：摘要 + 固定档案 + 当前任务的完整路线（供前端高亮绘制）"""

        drone = next((d for d in self.drones if d.id == drone_id), None)
        if drone is None:
            return None
        detail = self._drone_brief(drone)
        detail.update(
            {
                "sn": drone.sn,
                "model": DRONE_MODEL,
                "cruise_speed": drone.cruise_speed,
                "cruise_alt": drone.cruise_alt,
                "route": self._route_of(drone),
            }
        )
        return detail

    @staticmethod
    def _route_of(d: Drone) -> dict | None:
        if d.station is None:
            return None
        return {
            "base": {"lng": BASE_LNG, "lat": BASE_LAT},
            "station": {
                "code": d.station.code,
                "name": d.station.name,
                "lng": round(d.station.lng, 6),
                "lat": round(d.station.lat, 6),
            },
            "trip_total": round(d.trip_total),
        }

    @staticmethod
    def _drone_brief(d: Drone) -> dict:
        return {
            "id": d.id,
            "lng": round(d.lng, 6),
            "lat": round(d.lat, 6),
            "alt": round(d.alt, 1),
            "heading": round(d.heading, 1),
            "speed": round(d.speed, 1),
            "battery": round(d.battery, 1),
            "status": d.status,
            "order_id": d.order_id,
            "station_code": d.station.code if d.station else None,
            "progress": round(d.progress, 3),
            "flight_time": round(d.flight_time),
            "completed_orders": d.completed_orders,
        }


# ---- 单例与后台循环 ----

_engine: DroneSimEngine | None = None


def get_engine() -> DroneSimEngine:
    """懒加载单例：API 与后台循环共用一个引擎（同一事件循环，无线程安全问题）"""

    global _engine
    if _engine is None:
        _engine = DroneSimEngine()
    return _engine


async def _sim_loop() -> None:
    """每秒推演一拍。绝不让异常逃出杀死任务，下个周期重试"""

    engine = get_engine()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            engine.tick()
        except Exception:
            pass


def start_drone_tasks() -> list[asyncio.Task]:
    """服务启动时调用：立即建队（首页打开即有完整场面），挂推演循环"""

    get_engine()
    return [asyncio.create_task(_sim_loop())]
