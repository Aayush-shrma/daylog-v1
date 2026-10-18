"""Edge cases: missed days, backdating, editing old logs, month ends, caps."""

import datetime as dt

from app.config import settings
from app.services.llm_usage import DAILY_SERVER_KEY_LIMIT
from helpers import FakeResponse, patch_httpx, signup_verified


def signup(client, email="edge@example.com"):
    signup_verified(client, email)


def set_start(client, days_ago):
    start = dt.date.today() - dt.timedelta(days=days_ago)
    client.patch("/auth/me", json={"start_date": start.isoformat()})
    return start


def test_missed_day_then_backdate(client):
    signup(client)
    today = dt.date.today()
    set_start(client, 4)
    # log day 1 and day 3, skipping day 2
    client.post("/logs", json={"raw_text": "day one", "date": (today - dt.timedelta(days=4)).isoformat()})
    client.post("/logs", json={"raw_text": "day three", "date": (today - dt.timedelta(days=2)).isoformat()})
    assert client.get("/logs/day/1").status_code == 200
    assert client.get("/logs/day/2").status_code == 404
    assert client.get("/logs/day/3").json()["day_number"] == 3

    # backfill the missed day
    resp = client.post(
        "/logs", json={"raw_text": "day two", "date": (today - dt.timedelta(days=3)).isoformat()}
    )
    assert resp.status_code == 201
    assert resp.json()["log"]["day_number"] == 2
    stats = client.get("/stats").json()
    # the run ends two days ago, so it is the longest, not the current, streak
    assert stats["longest_streak"] == 3
    assert stats["current_streak"] == 0


def test_edit_an_old_log(client):
    signup(client)
    today = dt.date.today()
    set_start(client, 3)
    old = client.post(
        "/logs", json={"raw_text": "old", "date": (today - dt.timedelta(days=3)).isoformat()}
    ).json()["log"]
    resp = client.put(f"/logs/{old['id']}", json={"bullets": ["polished"], "tweet_text": "Day 1: polished"})
    assert resp.status_code == 200
    again = client.get("/logs/day/1").json()
    assert again["bullets"] == ["polished"]
    assert again["item_count"] == 1


def test_two_days_across_month_end(client):
    today = dt.date.today()
    first_of_month = today.replace(day=1)
    prev_last = first_of_month - dt.timedelta(days=1)  # last day of previous month
    start = prev_last - dt.timedelta(days=1)

    signup(client)
    client.patch("/auth/me", json={"start_date": start.isoformat()})
    r1 = client.post("/logs", json={"raw_text": "end of month", "date": prev_last.isoformat()})
    r2 = client.post("/logs", json={"raw_text": "new month", "date": first_of_month.isoformat()})
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["log"]["day_number"] == 2
    assert r2.json()["log"]["day_number"] == 3
    # they are consecutive, so the longest streak includes both
    assert client.get("/stats").json()["longest_streak"] >= 2


def test_shared_key_daily_cap(client, monkeypatch):
    signup(client)
    log_id = client.post("/logs", json={"raw_text": "no key at first"}).json()["log"]["id"]

    # Now the server has a key and the provider answers fine.
    monkeypatch.setattr(settings, "llm_api_key", "server-key")
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    body = '{"bullets": ["b"], "tweet": "Day 1: b"}'
    patch_httpx(
        monkeypatch,
        FakeResponse(payload={"candidates": [{"content": {"parts": [{"text": body}]}}]}),
    )

    for _ in range(DAILY_SERVER_KEY_LIMIT):
        res = client.post(f"/logs/{log_id}/regenerate")
        assert res.status_code == 200
        assert res.json()["used"] == "server"
        assert res.json()["notice"] is None

    # The next call falls back and asks for the user's own key.
    res = client.post(f"/logs/{log_id}/regenerate")
    assert res.json()["used"] == "fallback"
    assert "your own key" in res.json()["notice"]


def test_user_key_does_not_count_against_cap(client, monkeypatch):
    signup(client)
    log_id = client.post("/logs", json={"raw_text": "x"}).json()["log"]["id"]
    monkeypatch.setattr(settings, "llm_api_key", "server-key")
    patch_httpx(
        monkeypatch,
        FakeResponse(payload={"candidates": [{"content": {"parts": [{"text": '{"bullets":["b"],"tweet":"Day 1: b"}'}]}}]}),
    )
    headers = {"X-LLM-Provider": "gemini", "X-LLM-Key": "my-own-key"}
    for _ in range(DAILY_SERVER_KEY_LIMIT + 5):
        res = client.post(f"/logs/{log_id}/regenerate", headers=headers)
        assert res.json()["used"] == "user"
