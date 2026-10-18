"""Session cookie hardening, forged/expired tokens, CSRF origin check."""

import datetime as dt
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, settings
from helpers import signup_verified


def _token(sub: str, exp_delta: dt.timedelta) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode(
        {"sub": sub, "exp": now + exp_delta}, settings.secret_key, algorithm="HS256"
    )


def signup(client, email="sec@example.com", password="password-123"):
    return signup_verified(client, email, password)


def _signup_body(email="sec@example.com", password="password-123"):
    return {
        "first_name": "Sec",
        "email": email,
        "password": password,
        "confirm_password": password,
    }


def test_cookie_flags(client):
    resp = signup(client)
    cookie = resp.headers["set-cookie"]
    assert "daylog_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie.lower() or "samesite=lax" in cookie.lower()
    # BASE_URL is http in tests, so the cookie must not be Secure.
    assert "Secure" not in cookie


def test_expired_cookie_is_401(client):
    client.cookies.set("daylog_session", _token(str(uuid.uuid4()), dt.timedelta(days=-1)))
    assert client.get("/auth/me").status_code == 401


def test_forged_cookie_is_401(client):
    token = _token(str(uuid.uuid4()), dt.timedelta(days=1))
    client.cookies.set("daylog_session", token + "tampered")
    assert client.get("/auth/me").status_code == 401


def test_cookie_signed_with_wrong_key_is_401(client):
    now = dt.datetime.now(dt.timezone.utc)
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": now + dt.timedelta(days=1)},
        "some-other-key",
        algorithm="HS256",
    )
    client.cookies.set("daylog_session", token)
    assert client.get("/auth/me").status_code == 401


def test_valid_cookie_unknown_user_is_401(client):
    client.cookies.set("daylog_session", _token(str(uuid.uuid4()), dt.timedelta(days=1)))
    assert client.get("/auth/me").status_code == 401


def test_cross_origin_post_is_403(client):
    resp = client.post(
        "/auth/signup",
        json=_signup_body("x@example.com"),
        headers={"Origin": "https://evil.example.com"},
    )
    assert resp.status_code == 403


def test_dev_origin_is_403_unless_configured(client):
    # DEV_ALLOWED_ORIGINS is empty in tests/production, so a dev origin is foreign.
    resp = client.post(
        "/auth/signup",
        json=_signup_body("dev@example.com"),
        headers={"Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 403


def test_dev_origin_is_allowed_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "dev_allowed_origins", "http://localhost:5173")
    resp = client.post(
        "/auth/signup",
        json=_signup_body("dev@example.com"),
        headers={"Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 201


# --- production frontend origin (Vercel) ------------------------------------

def test_frontend_origin_is_allowed_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_origins", "https://daylog.vercel.app")
    resp = client.post(
        "/auth/signup",
        json=_signup_body("fe@example.com"),
        headers={"Origin": "https://daylog.vercel.app"},
    )
    assert resp.status_code == 201


def test_frontend_origin_is_403_unless_configured(client):
    # FRONTEND_ORIGINS is empty in tests/production, so the Vercel origin is
    # foreign until it is explicitly allowed.
    resp = client.post(
        "/auth/signup",
        json=_signup_body("fe2@example.com"),
        headers={"Origin": "https://daylog.vercel.app"},
    )
    assert resp.status_code == 403


def test_frontend_origin_matching_is_exact(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_origins", "https://daylog.vercel.app")
    lookalikes = [
        "https://daylog.vercel.app.evil.com",  # suffix attack
        "https://evil.vercel.app",             # different subdomain
        "http://daylog.vercel.app",            # scheme must match too
    ]
    for i, origin in enumerate(lookalikes):
        resp = client.post(
            "/auth/signup",
            json=_signup_body(f"look{i}@example.com"),
            headers={"Origin": origin},
        )
        assert resp.status_code == 403, origin


def test_frontend_origins_accepts_multiple_and_ignores_blanks(client, monkeypatch):
    monkeypatch.setattr(
        settings,
        "frontend_origins",
        " https://a.vercel.app , , https://b.vercel.app ",
    )
    allowed = client.post(
        "/auth/signup",
        json=_signup_body("multi@example.com"),
        headers={"Origin": "https://b.vercel.app"},
    )
    assert allowed.status_code == 201
    blocked = client.post(
        "/auth/signup",
        json=_signup_body("multi2@example.com"),
        headers={"Origin": "https://c.vercel.app"},
    )
    assert blocked.status_code == 403


def test_frontend_origin_star_is_not_a_wildcard(client, monkeypatch):
    monkeypatch.setattr(settings, "frontend_origins", "*")
    resp = client.post(
        "/auth/signup",
        json=_signup_body("star@example.com"),
        headers={"Origin": "https://evil.example.com"},
    )
    assert resp.status_code == 403


def test_dev_setting_does_not_enable_a_frontend_origin(client, monkeypatch):
    # The two allowlists are independent knobs: configuring the dev origin must
    # not silently trust the production frontend origin.
    monkeypatch.setattr(settings, "dev_allowed_origins", "http://localhost:5173")
    resp = client.post(
        "/auth/signup",
        json=_signup_body("indep@example.com"),
        headers={"Origin": "https://daylog.vercel.app"},
    )
    assert resp.status_code == 403


def test_same_origin_post_is_allowed(client):
    resp = client.post(
        "/auth/signup",
        json=_signup_body("ok@example.com"),
        headers={"Origin": settings.base_url},
    )
    assert resp.status_code == 201


def test_missing_origin_is_allowed(client):
    resp = client.post("/auth/signup", json=_signup_body("no@example.com"))
    assert resp.status_code == 201


def test_security_headers_present(client):
    resp = client.get("/health")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'self'" in resp.headers["content-security-policy"]


# --- production hardening ----------------------------------------------------

def test_production_refuses_default_or_short_secret_key():
    with pytest.raises(ValidationError):
        Settings(debug=False, secret_key="change-me")
    with pytest.raises(ValidationError):
        Settings(debug=False, secret_key="short")
    # A long random key is accepted in production.
    assert Settings(debug=False, secret_key="k" * 40).secret_key == "k" * 40


def test_https_base_url_is_treated_as_production():
    with pytest.raises(ValidationError):
        Settings(debug=True, secret_key="change-me", base_url="https://daylog.example.com")


def test_unhandled_error_leaks_no_stack_trace():
    from fastapi.routing import APIRoute

    from app.main import app

    def boom():
        raise RuntimeError("internal-detail-that-must-not-leak")

    # Insert before the SPA catch-all so the route is reachable.
    route = APIRoute("/_boom", boom, include_in_schema=False)
    app.router.routes.insert(0, route)
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            resp = c.get("/_boom")
    finally:
        app.router.routes.remove(route)

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Internal server error"}
    assert "RuntimeError" not in resp.text
    assert "internal-detail-that-must-not-leak" not in resp.text
    # Error responses still carry the standard headers.
    assert resp.headers["x-content-type-options"] == "nosniff"
