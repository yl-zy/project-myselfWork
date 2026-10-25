"""人口流动数据接口（公开）：大屏轮询用，设计草案 §4.5

flows 支持 since 增量拉取；summary 由服务端按最新批次聚合，
榜单口径统一在后端，前端不做聚合。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.migration import MigrationRecord
from app.services.regions import PROVINCE_MAP

router = APIRouter(prefix="/migration", tags=["migration"])


def _validate_scope(level: str, province: str | None) -> str | None:
    """校验 level/province 组合，返回生效的省份码（全国级为 None）"""

    if level not in ("nation", "province"):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_LEVEL", "message": "level 只支持 nation / province"},
        )
    if level == "nation":
        return None
    if not province:
        raise HTTPException(
            status_code=400,
            detail={"code": "PROVINCE_REQUIRED", "message": "level=province 时必传 province"},
        )
    if province not in PROVINCE_MAP:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_PROVINCE", "message": "无效的省份行政区划码"},
        )
    return province


def _latest_batch_time(db: Session) -> datetime | None:
    return db.scalar(select(func.max(MigrationRecord.batch_time)))


@router.get("/flows")
def get_flows(
    level: str = Query(default="nation"),
    province: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """流动记录：不带 since 返回最新一批；带 since 返回该时间之后的增量批次"""

    prov = _validate_scope(level, province)

    stmt = select(MigrationRecord)
    fallback_time = since
    if since is not None:
        stmt = stmt.where(MigrationRecord.batch_time > since)
    else:
        latest = _latest_batch_time(db)
        if latest is None:
            return {"batch_time": None, "records": []}
        stmt = stmt.where(MigrationRecord.batch_time == latest)
        fallback_time = latest
    if prov is not None:
        stmt = stmt.where(
            or_(MigrationRecord.from_code == prov, MigrationRecord.to_code == prov)
        )

    rows = db.scalars(
        stmt.order_by(MigrationRecord.batch_time, MigrationRecord.id)
    ).all()
    batch_time = max((r.batch_time for r in rows), default=fallback_time)
    return {
        "batch_time": batch_time,
        "records": [
            {"from_code": r.from_code, "to_code": r.to_code, "people": r.people}
            for r in rows
        ],
    }


@router.get("/summary")
def get_summary(
    level: str = Query(default="nation"),
    province: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """按最新批次聚合：全国级返回迁入/迁出/净流入 TOP10；省级返回该省对端明细与净流入"""

    prov = _validate_scope(level, province)

    latest = _latest_batch_time(db)
    if latest is None:
        return {"batch_time": None, "level": level}
    stmt = select(MigrationRecord).where(MigrationRecord.batch_time == latest)
    if prov is not None:
        stmt = stmt.where(
            or_(MigrationRecord.from_code == prov, MigrationRecord.to_code == prov)
        )
    rows = db.scalars(stmt).all()

    def named_top(sums: dict[str, int], key_name: str) -> list[dict]:
        ranked = sorted(sums.items(), key=lambda kv: kv[1], reverse=True)[:10]
        return [
            {"code": code, "name": PROVINCE_MAP.get(code, code), key_name: value}
            for code, value in ranked
        ]

    in_sum: dict[str, int] = {}
    out_sum: dict[str, int] = {}
    for r in rows:
        in_sum[r.to_code] = in_sum.get(r.to_code, 0) + r.people
        out_sum[r.from_code] = out_sum.get(r.from_code, 0) + r.people

    if prov is None:
        net = {
            code: in_sum.get(code, 0) - out_sum.get(code, 0)
            for code in set(in_sum) | set(out_sum)
        }
        net_in = {c: v for c, v in net.items() if v > 0}
        return {
            "batch_time": latest,
            "level": level,
            "top_in": named_top(in_sum, "people"),
            "top_out": named_top(out_sum, "people"),
            "top_net_in": named_top(net_in, "value"),
        }

    # 省级视角：谁迁入我省（按来源省）、我省迁出去哪（按目的省）
    in_from_sums: dict[str, int] = {}
    out_to_sums: dict[str, int] = {}
    for r in rows:
        if r.to_code == prov:
            in_from_sums[r.from_code] = in_from_sums.get(r.from_code, 0) + r.people
        if r.from_code == prov:
            out_to_sums[r.to_code] = out_to_sums.get(r.to_code, 0) + r.people
    total_in = sum(in_from_sums.values())
    total_out = sum(out_to_sums.values())
    return {
        "batch_time": latest,
        "level": level,
        "province": {"code": prov, "name": PROVINCE_MAP[prov]},
        "total_in": total_in,
        "total_out": total_out,
        "net": total_in - total_out,
        "in_from": named_top(in_from_sums, "people"),
        "out_to": named_top(out_to_sums, "people"),
    }
