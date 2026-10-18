"""The /stats endpoint."""

import datetime as dt

from app.routers.stats import HEATMAP_DAYS
from helpers import signup_verified


def signup(client, email="stats@example.com"):
    signup_verified(client, email)


def test_stats_requires_auth(client):
    assert client.get("/stats").status_code == 401


def test_stats_empty(client):
    signup(client)
    body = client.get("/stats").json()
    assert body["current_streak"] == 0
    assert body["longest_streak"] == 0
    assert body["total_days"] == 0
    assert body["total_items"] == 0
    assert len(body["heatmap"]) == HEATMAP_DAYS
    assert body["heatmap"][-1]["date"] == dt.date.today().isoformat()
    assert all(cell["level"] == 0 and cell["count"] == 0 for cell in body["heatmap"])


def test_stats_with_logs(client):
    signup(client)
    today = dt.date.today()
    client.patch(
        "/auth/me", json={"start_date": (today - dt.timedelta(days=2)).isoformat()}
    )
    client.post("/logs", json={"raw_text": "a\nb", "date": today.isoformat()})      # 2 items
    client.post(
        "/logs",
        json={"raw_text": "c", "date": (today - dt.timedelta(days=1)).isoformat()},  # 1 item
    )

    body = client.get("/stats").json()
    assert body["current_streak"] == 2
    assert body["longest_streak"] == 2
    assert body["total_days"] == 2
    assert body["total_items"] == 3
    assert body["heatmap"][-1] == {"date": today.isoformat(), "count": 2, "level": 1}
    # the day before yesterday is empty
    assert body["heatmap"][-3]["count"] == 0
    assert body["heatmap"][-3]["level"] == 0


def test_stats_isolated_between_users(client, make_client):
    signup(client)
    client.post("/logs", json={"raw_text": "mine"})

    other = make_client()
    signup(other, "other@example.com")
    body = other.get("/stats").json()
    assert body["total_days"] == 0
    assert body["total_items"] == 0
