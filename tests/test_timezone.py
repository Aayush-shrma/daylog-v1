"""Timezone behaviour: the user's local date, never the UTC date."""

import datetime as dt
from zoneinfo import ZoneInfo

from app import timeutils


def test_to_local_date_ist_ahead_of_utc():
    # 19:30 UTC is already 01:00 the next day in IST.
    moment = dt.datetime(2026, 10, 16, 19, 30, tzinfo=dt.timezone.utc)
    assert timeutils.to_local_date(moment) == dt.date(2026, 10, 17)


def test_to_local_date_same_day_midday():
    moment = dt.datetime(2026, 10, 17, 6, 0, tzinfo=dt.timezone.utc)  # 11:30 IST
    assert timeutils.to_local_date(moment) == dt.date(2026, 10, 17)


def test_local_today_uses_configured_timezone(monkeypatch):
    frozen = dt.datetime(2026, 10, 16, 19, 30, tzinfo=dt.timezone.utc)

    class FrozenDatetime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return frozen if tz is None else frozen.astimezone(tz)

    monkeypatch.setattr(timeutils.dt, "datetime", FrozenDatetime)
    # IST (UTC+5:30) is already the 17th;
    assert timeutils.local_today() == dt.date(2026, 10, 17)

    # while a UTC-configured server would still say the 16th.
    assert (frozen.astimezone(ZoneInfo("UTC"))).date() == dt.date(2026, 10, 16)
