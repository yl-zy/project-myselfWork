"""无人机航线（只读）：预置数据一次性返回，飞行状态是纯前端运行时状态（设计草案 §3.2）"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.flight import FlightRoute, FlightRoutePoint
from app.schemas.flight import FlightPointOut, FlightRouteOut

router = APIRouter(prefix="/flight", tags=["flight"])


@router.get("/routes")
def list_routes(db: Session = Depends(get_db)) -> dict:
    """预置航线 + 途经点（公开）：点数少，一次性全量返回，前端按需取用"""

    routes = db.scalars(select(FlightRoute).order_by(FlightRoute.id)).all()
    points = db.scalars(
        select(FlightRoutePoint).order_by(
            FlightRoutePoint.route_id, FlightRoutePoint.seq
        )
    ).all()

    points_by_route: dict[int, list] = {}
    for p in points:
        points_by_route.setdefault(p.route_id, []).append(
            FlightPointOut.model_validate(p).model_dump(mode="json")
        )

    return {
        "routes": [
            FlightRouteOut(
                id=r.id, name=r.name, points=points_by_route.get(r.id, [])
            ).model_dump(mode="json")
            for r in routes
        ]
    }
