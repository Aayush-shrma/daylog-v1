"""Log endpoints: CRUD, day lookup, search, isolation and BYOK transport."""

import datetime as dt

from helpers import FakeResponse, patch_httpx, signup_verified


def signup(client, email="logger@example.com", password="password-123"):
    return signup_verified(client, email, password).json()


def create(client, raw_text="learned docker\nbuilt an image", date=None, **kwargs):
    body = {"raw_text": raw_text}
    if date is not None:
        body["date"] = date
    return client.post("/logs", json=body, **kwargs)


def test_create_log_defaults_to_today(client):
    signup(client)
    resp = create(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["used"] == "fallback"
    assert body["log"]["date"] == dt.date.today().isoformat()
    assert body["log"]["day_number"] == 1
    assert body["log"]["item_count"] == len(body["log"]["bullets"]) == 2
    assert body["log"]["bullets"] == ["learned docker", "built an image"]


def test_create_requires_auth(client):
    assert create(client).status_code == 401


def test_backdated_log_day_number(client):
    user = signup(client)
    client.patch("/auth/me", json={"start_date": (dt.date.today() - dt.timedelta(days=4)).isoformat()})
    resp = create(client, date=(dt.date.today() - dt.timedelta(days=2)).isoformat())
    assert resp.status_code == 201
    assert resp.json()["log"]["day_number"] == 3


def test_future_date_rejected(client):
    signup(client)
    future = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    assert create(client, date=future).status_code == 422


def test_before_start_date_rejected(client):
    signup(client)
    past = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    assert create(client, date=past).status_code == 422


def test_duplicate_date_409_with_existing_id(client):
    signup(client)
    first = create(client)
    assert first.status_code == 201
    resp = create(client, raw_text="again")
    assert resp.status_code == 409
    assert resp.json()["detail"]["log_id"] == first.json()["log"]["id"]


def test_get_by_day(client):
    signup(client)
    created = create(client).json()["log"]
    resp = client.get("/logs/day/1")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_by_day_missing_404(client):
    signup(client)
    assert client.get("/logs/day/99").status_code == 404


def test_update_bullets_and_tweet(client):
    signup(client)
    log_id = create(client).json()["log"]["id"]
    resp = client.put(
        f"/logs/{log_id}",
        json={"bullets": ["one", "two", "three"], "tweet_text": "Day 1: three things"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["bullets"] == ["one", "two", "three"]
    assert body["item_count"] == 3
    assert body["tweet_text"] == "Day 1: three things"


def test_update_tweet_too_long_422(client):
    signup(client)
    log_id = create(client).json()["log"]["id"]
    resp = client.put(f"/logs/{log_id}", json={"tweet_text": "x" * 281})
    assert resp.status_code == 422


def test_regenerate_overwrites(client):
    signup(client)
    log_id = create(client).json()["log"]["id"]
    client.put(f"/logs/{log_id}", json={"bullets": ["edited"]})
    resp = client.post(f"/logs/{log_id}/regenerate")
    assert resp.status_code == 200
    assert resp.json()["log"]["bullets"] == ["learned docker", "built an image"]


def test_search_matches_raw_text_and_bullets(client):
    signup(client)
    create(client, raw_text="played with kubernetes\nran a pod")
    resp = client.get("/logs", params={"q": "KUBERNETES"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    # a bullets-only hit
    resp = client.get("/logs", params={"q": "pod"})
    assert len(resp.json()) == 1


def test_search_escapes_like_wildcards(client):
    signup(client)
    client.patch("/auth/me", json={"start_date": (dt.date.today() - dt.timedelta(days=2)).isoformat()})
    today = dt.date.today()
    create(client, raw_text="under_score here", date=(today - dt.timedelta(days=2)).isoformat())
    create(client, raw_text="plain words", date=(today - dt.timedelta(days=1)).isoformat())
    create(client, raw_text="100% done", date=today.isoformat())

    # "%" matches only the literal percent, not every row.
    hits = client.get("/logs", params={"q": "%"}).json()
    assert [h["raw_text"] for h in hits] == ["100% done"]
    # "_" matches only the literal underscore.
    hits = client.get("/logs", params={"q": "_"}).json()
    assert [h["raw_text"] for h in hits] == ["under_score here"]


def test_list_recent_without_query(client):
    signup(client)
    client.patch("/auth/me", json={"start_date": (dt.date.today() - dt.timedelta(days=2)).isoformat()})
    create(client, raw_text="a", date=(dt.date.today() - dt.timedelta(days=2)).isoformat())
    create(client, raw_text="b", date=(dt.date.today() - dt.timedelta(days=1)).isoformat())
    resp = client.get("/logs")
    assert resp.status_code == 200
    dates = [item["date"] for item in resp.json()]
    assert dates == sorted(dates, reverse=True)


def test_list_pagination(client):
    signup(client)
    client.patch("/auth/me", json={"start_date": (dt.date.today() - dt.timedelta(days=4)).isoformat()})
    for i in range(5):
        create(client, raw_text=f"day {i}", date=(dt.date.today() - dt.timedelta(days=i)).isoformat())
    resp = client.get("/logs", params={"limit": 2, "offset": 0})
    assert len(resp.json()) == 2


def test_two_users_cannot_see_each_other(client, make_client):
    signup(client, "a@example.com")
    log_id = create(client).json()["log"]["id"]

    other = make_client()
    signup(other, "b@example.com")
    assert other.get("/logs/day/1").status_code == 404
    assert other.put(f"/logs/{log_id}", json={"bullets": ["hijack"]}).status_code == 404
    assert other.post(f"/logs/{log_id}/regenerate").status_code == 404
    assert other.get("/logs").json() == []
    # the first user's log is untouched
    assert client.get(f"/logs/day/1").json()["bullets"] == ["learned docker", "built an image"]


def test_byok_headers_used_for_cleaning(client, monkeypatch):
    signup(client)
    body = '{"bullets": ["Used my own key"], "tweet": "Day 1: used my own key"}'
    patch_httpx(
        monkeypatch,
        FakeResponse(payload={"candidates": [{"content": {"parts": [{"text": body}]}}]}),
    )
    resp = create(
        client,
        raw_text="whatever",
        headers={
            "X-LLM-Provider": "gemini",
            "X-LLM-Key": "user-owned-key",
            "X-LLM-Model": "gemini-2.5-flash",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["used"] == "user"
    assert resp.json()["log"]["bullets"] == ["Used my own key"]
