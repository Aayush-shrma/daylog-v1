"""Daily cap on LLM calls that spend the *server's* key.

In-memory only (fine for a single instance, v1). With multiple workers each
process would keep its own counter, so this would move to a shared store later.
Calls made with the user's own key are never counted here.
"""

import datetime as dt
from collections import defaultdict

DAILY_SERVER_KEY_LIMIT = 20


class DailyUsage:
    def __init__(self, limit: int = DAILY_SERVER_KEY_LIMIT) -> None:
        self.limit = limit
        self._counts: dict[tuple[str, str], int] = defaultdict(int)

    def _key(self, user_id: object, day: dt.date) -> tuple[str, str]:
        return (str(user_id), day.isoformat())

    def remaining(self, user_id: object, day: dt.date) -> int:
        return max(0, self.limit - self._counts[self._key(user_id, day)])

    def consume(self, user_id: object, day: dt.date) -> bool:
        """Record one server-key call. False when the cap is already reached."""
        key = self._key(user_id, day)
        if self._counts[key] >= self.limit:
            return False
        self._counts[key] += 1
        return True


server_key_usage = DailyUsage()
