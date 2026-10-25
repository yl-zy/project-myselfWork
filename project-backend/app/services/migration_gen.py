"""人口流动模拟数据：周期生成 + 过期清理（设计草案 §3.2 migration_records）

generate_batch / cleanup_expired 是同步函数，测试可直接调用；
两个 async 循环由 main.py 启动时挂为 asyncio 任务，与 API 同进程运行（不引 Celery）。
类比前端：相当于 setInterval 跑一个数据制造机，只是跑在后端进程里。
"""

import asyncio
import random
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import SessionLocal
from app.models.migration import MigrationRecord
from app.services.regions import MEAN_WEIGHT, PROVINCES

_CODES = [p["code"] for p in PROVINCES]
_WEIGHTS = [p["weight"] for p in PROVINCES]
_WEIGHT_OF = {p["code"]: p["weight"] for p in PROVINCES}


def generate_batch(db: Session, batch_time: datetime | None = None, size: int | None = None) -> int:
    """生成一批省际流动记录，返回条数。batch_time/size 可指定，便于测试确定性"""

    batch_time = batch_time or datetime.now()
    size = size or random.randint(20, 40)
    created = 0
    for _ in range(size):
        from_code = random.choices(_CODES, weights=_WEIGHTS, k=1)[0]
        to_code = random.choices(_CODES, weights=_WEIGHTS, k=1)[0]
        if to_code == from_code:
            continue  # 省内流动不在大屏口径内
        # 人数按两端省份人口规模的几何平均缩放，大省之间流粗、小省之间流细
        scale = (_WEIGHT_OF[from_code] * _WEIGHT_OF[to_code]) ** 0.5 / MEAN_WEIGHT
        people = min(3000, max(20, int(random.gauss(200, 120) * scale)))
        db.add(
            MigrationRecord(
                from_code=from_code, to_code=to_code, people=people, batch_time=batch_time
            )
        )
        created += 1
    db.commit()
    return created


def cleanup_expired(db: Session, retention_days: int | None = None) -> int:
    """删除超过滚动保留期的批次，返回删除条数"""

    days = retention_days if retention_days is not None else config.MIGRATION_RETENTION_DAYS
    cutoff = datetime.now() - timedelta(days=days)
    result = db.execute(
        delete(MigrationRecord).where(MigrationRecord.batch_time < cutoff)
    )
    db.commit()
    return result.rowcount or 0


async def _generate_loop() -> None:
    """每 N 秒生成一批。后台循环绝不让异常逃出杀死任务，下个周期重试"""

    while True:
        await asyncio.sleep(config.MIGRATION_BATCH_INTERVAL_SECONDS)
        try:
            with SessionLocal() as db:
                generate_batch(db)
        except Exception:
            pass


async def _cleanup_loop() -> None:
    """每小时扫一次过期数据（凌晨精确删除对演示无意义，每小时足够平滑）"""

    while True:
        await asyncio.sleep(3600)
        try:
            with SessionLocal() as db:
                cleanup_expired(db)
        except Exception:
            pass


def start_migration_tasks() -> list[asyncio.Task]:
    """服务启动时调用：空表立即生成一批（演示开机即有数据），顺手清一次过期"""

    try:
        with SessionLocal() as db:
            empty = db.scalar(select(func.count(MigrationRecord.id))) == 0
            if empty:
                generate_batch(db)
            cleanup_expired(db)
    except Exception:
        pass  # 启动期数据库未就绪不阻塞服务，循环任务稍后会重试
    return [
        asyncio.create_task(_generate_loop()),
        asyncio.create_task(_cleanup_loop()),
    ]
