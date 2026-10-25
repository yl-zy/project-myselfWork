"""性能监控（设计草案 §4.6）：上报永不对调用方报错，超限/脏数据静默丢弃

- POST /api/perf/events    公开，批量上报，永远 200
- GET  /api/perf/summary   公开，P75 / 按小时趋势 / 页面排行
- GET  /api/perf/errors    公开，错误列表倒序分页
- DELETE /api/perf/events  admin，清空（PRD FR-5.5）

分钟级限流用进程内固定窗口计数：上报接口的故障模式只是多存几行，
重启清零可接受，不值得为它再写表（与问答限流的持久化约束不同）。
"""

import json
import math
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import get_db
from app.core.deps import require_admin
from app.models.perf import PerfEvent
from app.models.user import User

router = APIRouter(prefix="/perf", tags=["perf"])

VALID_TYPES = {"metric", "api", "error"}
MAX_BATCH = 50
MAX_EXTRA_BYTES = 4096

# {ip: (minute_epoch, count)} 固定窗口计数器
_rate_window: dict[str, tuple[int, int]] = {}


def _minute_limit_ok(ip: str) -> bool:
    minute = int(time.time()) // 60
    window_minute, count = _rate_window.get(ip, (minute, 0))
    if window_minute != minute:
        window_minute, count = minute, 0
    count += 1
    _rate_window[ip] = (minute, count)
    return count <= config.PERF_RATE_LIMIT_PER_MINUTE


def _parse_event(raw) -> PerfEvent | None:
    """逐条容错校验：任何一条不合格只丢弃该条，不影响整批"""

    if not isinstance(raw, dict):
        return None
    event_type = raw.get("event_type")
    page, name, visitor_id = raw.get("page"), raw.get("name"), raw.get("visitor_id")
    if event_type not in VALID_TYPES:
        return None
    if not all(isinstance(v, str) and v for v in (page, name, visitor_id)):
        return None
    value = raw.get("value")
    if value is not None and not isinstance(value, (int, float)):
        return None
    extra = raw.get("extra")
    if extra is not None:
        if not isinstance(extra, dict):
            return None
        if len(json.dumps(extra, ensure_ascii=False)) > MAX_EXTRA_BYTES:
            return None
    return PerfEvent(
        event_type=event_type,
        page=page[:64],
        name=name[:64],
        value=value,
        extra=extra,
        visitor_id=visitor_id[:64],
    )


@router.post("/events")
async def report_events(request: Request, db: Session = Depends(get_db)) -> dict:
    """批量上报：单批最多收 50 条，超限与脏数据静默丢弃，永远返回 200"""

    ip = request.client.host if request.client else "unknown"
    if not _minute_limit_ok(ip):
        return {"accepted": 0}
    try:
        body = await request.json()
    except Exception:
        return {"accepted": 0}
    events = body.get("events") if isinstance(body, dict) else None
    if not isinstance(events, list):
        return {"accepted": 0}

    accepted = 0
    for raw in events[:MAX_BATCH]:
        event = _parse_event(raw)
        if event is not None:
            db.add(event)
            accepted += 1
    db.commit()
    return {"accepted": accepted}


def _range_cutoff(range_: str) -> datetime:
    hours = {"1d": 24, "3d": 72, "7d": 168}.get(range_, 24)
    return datetime.now() - timedelta(hours=hours)


def _p75(values: list[float]) -> float | None:
    if not values:
        return None
    values = sorted(values)
    return values[math.ceil(0.75 * len(values)) - 1]


@router.get("/summary")
def get_summary(
    range: str = Query(default="1d"),
    page: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """聚合看板：各指标 P75、按小时均值趋势、页面事件量排行（演示数据量在 Python 里算足够）"""

    cutoff = _range_cutoff(range)
    stmt = select(PerfEvent).where(PerfEvent.created_at >= cutoff)
    if page:
        stmt = stmt.where(PerfEvent.page == page)
    rows = db.scalars(stmt).all()

    metric_values: dict[str, list[float]] = {}
    hourly: dict[tuple[str, str], list[float]] = {}
    page_count: dict[str, int] = {}
    for r in rows:
        page_count[r.page] = page_count.get(r.page, 0) + 1
        if r.event_type == "metric" and r.value is not None:
            metric_values.setdefault(r.name, []).append(r.value)
            hour = r.created_at.replace(minute=0, second=0, microsecond=0)
            hourly.setdefault((hour.isoformat(), r.name), []).append(r.value)

    return {
        "range": range,
        "metrics": [
            {"name": name, "p75": _p75(vals), "count": len(vals)}
            for name, vals in sorted(metric_values.items())
        ],
        "trend": [
            {"hour": hour, "name": name, "avg": round(sum(vals) / len(vals), 2)}
            for (hour, name), vals in sorted(hourly.items())
        ],
        "pages": [
            {"page": p, "count": c}
            for p, c in sorted(page_count.items(), key=lambda kv: kv[1], reverse=True)
        ],
    }


@router.get("/errors")
def get_errors(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    """错误列表：时间倒序分页"""

    total = db.scalar(
        select(func.count(PerfEvent.id)).where(PerfEvent.event_type == "error")
    )
    rows = db.scalars(
        select(PerfEvent)
        .where(PerfEvent.event_type == "error")
        .order_by(PerfEvent.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return {
        "total": total or 0,
        "list": [
            {
                "id": r.id,
                "page": r.page,
                "name": r.name,
                "extra": r.extra,
                "visitor_id": r.visitor_id,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


@router.delete("/events")
def clear_events(
    db: Session = Depends(get_db), admin: User = Depends(require_admin)
) -> dict:
    """清空性能事件（仅管理员）"""

    deleted = db.execute(delete(PerfEvent)).rowcount or 0
    db.commit()
    return {"deleted": deleted}
