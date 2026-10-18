"""Streak and heatmap maths. Pure functions: no DB, no LLM."""

import datetime as dt
from collections.abc import Iterable

_DAY = dt.timedelta(days=1)


def heatmap_level(count: int) -> int:
    """Bucket a day's activity for the heatmap."""
    if count <= 0:
        return 0
    if count <= 2:
        return 1
    if count <= 4:
        return 2
    if count <= 6:
        return 3
    return 4


def current_streak(dates: Iterable[dt.date], today: dt.date) -> int:
    """Consecutive log days ending today or yesterday.

    Today isn't "broken" until the day ends, so a run ending yesterday still
    counts. Anything older than yesterday means the streak is 0.
    """
    days = set(dates)
    if today in days:
        cursor = today
    elif (today - _DAY) in days:
        cursor = today - _DAY
    else:
        return 0

    streak = 0
    while cursor in days:
        streak += 1
        cursor -= _DAY
    return streak


def longest_streak(dates: Iterable[dt.date]) -> int:
    """Longest run of consecutive dates; one scan over sorted unique dates."""
    ordered = sorted(set(dates))
    if not ordered:
        return 0
    best = 1
    run = 1
    for prev, cur in zip(ordered, ordered[1:]):
        if (cur - prev) == _DAY:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best
