"""物流无人机队监控：快照 + 单机详情（数据来自内存模拟引擎，不落库，设计草案 §3.5）"""

from fastapi import APIRouter, HTTPException

from app.services.drone_sim import get_engine

router = APIRouter(prefix="/drones", tags=["drones"])


@router.get("/snapshot")
def drone_snapshot() -> dict:
    """全队快照（公开）：200 台无人机摘要 + 机队统计，前端 2s 轮询"""

    return get_engine().snapshot()


@router.get("/{drone_id}")
def drone_detail(drone_id: str) -> dict:
    """单机详情（公开）：摘要 + 固定档案 + 当前任务完整路线"""

    detail = get_engine().detail(drone_id)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "DRONE_NOT_FOUND", "message": f"无人机 {drone_id} 不存在"},
        )
    return detail
