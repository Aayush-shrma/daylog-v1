"""Stats: streaks, totals and a 365-day heatmap."""

import datetime as dt
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Log, User
from ..security import get_current_user
from ..services.streaks import current_streak, heatmap_level, longest_streak
from ..timeutils import local_today

router = APIRouter(tags=["stats"])

HEATMAP_DAYS = 365


@router.get("/stats")
def stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = db.execute(
        select(Log.date, Log.item_count).where(Log.user_id == user.id)
    ).all()

    counts: dict[dt.date, int] = defaultdict(int)
    total_items = 0
    for log_date, item_count in rows:
        counts[log_date] = item_count  # one log per date
        total_items += item_count

    today = local_today()
    start = today - dt.timedelta(days=HEATMAP_DAYS - 1)
    heatmap = []
    for offset in range(HEATMAP_DAYS):
        day = start + dt.timedelta(days=offset)
        count = counts.get(day, 0)
        heatmap.append({"date": day, "count": count, "level": heatmap_level(count)})

    return {
        "current_streak": current_streak(counts.keys(), today),
        "longest_streak": longest_streak(counts.keys()),
        "total_days": len(counts),
        "total_items": total_items,
        "heatmap": heatmap,
    }
