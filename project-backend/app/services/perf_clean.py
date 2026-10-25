"""perf_events 过期清理：滚动保留 7 天（设计草案 §6.2），由后台 cleanup 循环调用"""

from datetime import datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core import config
from app.models.perf import PerfEvent


def cleanup_expired_perf(db: Session, retention_days: int | None = None) -> int:
    """删除超过滚动保留期的性能事件，返回删除条数"""

    days = retention_days if retention_days is not None else config.PERF_RETENTION_DAYS
    cutoff = datetime.now() - timedelta(days=days)
    result = db.execute(delete(PerfEvent).where(PerfEvent.created_at < cutoff))
    db.commit()
    return result.rowcount or 0
