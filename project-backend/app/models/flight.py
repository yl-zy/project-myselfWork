from sqlalchemy import Double, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, IntPkMixin, TimestampMixin


class FlightRoute(Base, IntPkMixin, TimestampMixin):
    """无人机航线：P0 全部为预置只读数据"""

    __tablename__ = "flight_routes"

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_preset: Mapped[int] = mapped_column(TINYINT, nullable=False, default=1)


class FlightRoutePoint(Base, IntPkMixin, TimestampMixin):
    """航线途经点：经纬度 + 相对高度（米），seq 为途经顺序"""

    __tablename__ = "flight_route_points"

    route_id: Mapped[int] = mapped_column(ForeignKey("flight_routes.id"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    lng: Mapped[float] = mapped_column(Double, nullable=False)
    lat: Mapped[float] = mapped_column(Double, nullable=False)
    altitude: Mapped[float] = mapped_column(Double, nullable=False)

    __table_args__ = (UniqueConstraint("route_id", "seq", name="uq_route_seq"),)
