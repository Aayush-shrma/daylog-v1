"""Timezone-aware helpers: the user's "today" is a local date, never UTC."""

import datetime as dt
from zoneinfo import ZoneInfo

from .config import settings


def local_tz() -> ZoneInfo:
    return ZoneInfo(settings.default_timezone)


def local_today() -> dt.date:
    """Today's date in DEFAULT_TIMEZONE (e.g. Asia/Kolkata)."""
    return to_local_date(dt.datetime.now(dt.timezone.utc))


def to_local_date(moment: dt.datetime) -> dt.date:
    """Convert an aware datetime to a date in DEFAULT_TIMEZONE."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=dt.timezone.utc)
    return moment.astimezone(local_tz()).date()
