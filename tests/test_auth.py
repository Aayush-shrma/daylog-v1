"""Auth: signup, login, sessions, rate limit, /auth/me.

Signup no longer creates a session: an email/password account must verify its
email first. Most tests here therefore use `verified()`, which signs up,
consumes the emailed token and logs in.
"""

import datetime as dt
import uuid

from sqlalchemy import select

from app.database import SessionLocal
from app.models import EmailVerificationToken, Log
from helpers import last_verification_token, signup_verified

EMAIL = "user@example.com"
PASSWORD = "correct-horse-battery"


def signup(client, email=EMAIL, password=PASSWORD, first_name="Test"):
    return client.post(
        "/auth/signup",
        json={
            "first_name": first_name,
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )


def verified(client, email=EMAIL, password=PASSWORD, first_name="Test"):
    return signup_verified(client, email, password, first_name)


def test_signup_creates_unverified_user_without_session(client):
    resp = signup(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["email"] == EMAIL
    assert body["user"]["has_password"] is True
    assert body["user"]["email_verified"] is False
    assert body["user"]["name"] == "Test"
    assert body["verification_email_sent"] is True
    assert "password" not in body["user"]
    assert "password_hash" not in resp.text
    # No usable session is handed out before verification.
    assert not client.cookies.get("daylog_session")


def test_signup_lowercases_email(client):
    resp = signup(client, email="MiXeD@Example.COM")
    assert resp.status_code == 201
    assert resp.json()["user"]["email"] == "mixed@example.com"


def test_duplicate_signup_409(client):
    assert signup(client).status_code == 201
    resp = signup(client)
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


def test_signup_rejects_short_password(client):
    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "Test",
            "email": EMAIL,
            "password": "short",
            "confirm_password": "short",
        },
    )
    assert resp.status_code == 422


def test_signup_rejects_bad_email(client):
    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "Test",
            "email": "not-an-email",
            "password": PASSWORD,
            "confirm_password": PASSWORD,
        },
    )
    assert resp.status_code == 422


def test_login_ok(client):
    resp = verified(client)
    assert resp.status_code == 200
    assert resp.json()["email"] == EMAIL
    assert resp.json()["email_verified"] is True


def test_login_case_insensitive_email(client):
    verified(client)
    client.cookies.clear()
    resp = client.post("/auth/login", json={"email": EMAIL.upper(), "password": PASSWORD})
    assert resp.status_code == 200


def test_login_wrong_password_generic_error(client):
    verified(client)
    client.cookies.clear()
    resp = client.post("/auth/login", json={"email": EMAIL, "password": "wrong-password"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_same_error(client):
    resp = client.post("/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


def test_login_rate_limited_after_five_failures(client):
    verified(client)
    client.cookies.clear()
    for _ in range(5):
        resp = client.post("/auth/login", json={"email": EMAIL, "password": "bad"})
        assert resp.status_code == 401
    resp = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 429


def test_rate_limit_is_per_email(client):
    verified(client)
    client.cookies.clear()
    for _ in range(5):
        client.post("/auth/login", json={"email": EMAIL, "password": "bad"})
    other = client.post(
        "/auth/login", json={"email": "other@example.com", "password": "bad"}
    )
    assert other.status_code == 401  # not blocked


def test_rate_limit_cannot_be_bypassed_by_spoofed_ip(client, monkeypatch):
    """A different (spoofable) client IP per attempt must not reset the lockout."""
    verified(client)
    client.cookies.clear()

    spoofed = iter(f"198.51.100.{i}" for i in range(1, 100))
    monkeypatch.setattr("app.routers.auth.client_ip", lambda request: next(spoofed))

    for _ in range(5):
        resp = client.post("/auth/login", json={"email": EMAIL, "password": "bad"})
        assert resp.status_code == 401
    resp = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 429


def test_logout_clears_cookie(client):
    verified(client)
    assert client.cookies.get("daylog_session")
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    assert not client.cookies.get("daylog_session")
    assert client.get("/auth/me").status_code == 401


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401


def test_me_returns_current_user(client):
    verified(client)
    resp = client.get("/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == EMAIL
    assert resp.json()["email_verified"] is True


def test_auth_config_hides_google_when_unset(client):
    resp = client.get("/auth/config")
    assert resp.status_code == 200
    assert resp.json() == {"google_enabled": False, "email_enabled": False}


def test_patch_start_date_recomputes_day_numbers(client, make_log):
    user_id = verified(client).json()["id"]
    today = dt.date.today()
    make_log(user_id, today, day_number=1)

    new_start = today - dt.timedelta(days=9)
    resp = client.patch("/auth/me", json={"start_date": new_start.isoformat()})
    assert resp.status_code == 200
    assert resp.json()["start_date"] == new_start.isoformat()

    db = SessionLocal()
    try:
        log = db.scalar(select(Log).where(Log.user_id == uuid.UUID(user_id)))
        assert log.day_number == 10
    finally:
        db.close()


def test_patch_start_date_rejects_future(client):
    verified(client)
    future = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    resp = client.patch("/auth/me", json={"start_date": future})
    assert resp.status_code == 422


def test_delete_me_removes_user_logs_and_tokens(client, make_log):
    user_id = verified(client).json()["id"]
    make_log(user_id, dt.date.today())

    resp = client.delete("/auth/me")
    assert resp.status_code == 204
    assert client.get("/auth/me").status_code == 401

    db = SessionLocal()
    try:
        assert db.get(Log, 1) is None
        from app.models import User

        assert db.get(User, uuid.UUID(user_id)) is None
        assert db.scalar(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == uuid.UUID(user_id)
            )
        ) is None
    finally:
        db.close()


def test_password_never_in_any_response(client):
    resp = signup(client)
    assert PASSWORD not in resp.text
    client.post("/auth/verify-email", json={"token": last_verification_token()})
    login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    assert PASSWORD not in login.text
    resp = client.get("/auth/me")
    assert PASSWORD not in resp.text
    resp = client.post("/auth/logout")
    assert PASSWORD not in resp.text
