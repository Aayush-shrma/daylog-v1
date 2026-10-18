"""resolve_google_user branches, and the callback route with the token exchange mocked."""

import pytest
from fastapi import HTTPException

import app.routers.auth as auth_mod
from app.models import User
from app.security import hash_password
from app.services.google import resolve_google_user


def test_branch1_reuses_known_google_sub(db_session):
    user = User(email="a@example.com", google_sub="sub-1", password_hash=None)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    claims = {"sub": "sub-1", "email": "whatever@example.com", "email_verified": True}
    got = resolve_google_user(db_session, claims)
    assert got.id == user.id
    # A Google-linked account is trusted; the flag is corrected if missing.
    assert got.email_verified is True


def test_branch2_links_existing_email_and_drops_password(db_session):
    user = User(email="b@example.com", password_hash=hash_password("password-123"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    assert user.email_verified is False

    claims = {
        "sub": "sub-2",
        "email": "B@Example.com",
        "email_verified": True,
        "name": "Bee",
    }
    got = resolve_google_user(db_session, claims)
    assert got.id == user.id
    assert got.google_sub == "sub-2"
    # The pre-registered password must not survive the link.
    assert got.password_hash is None
    # Google proved ownership of the address, so the account is verified.
    assert got.email_verified is True


def test_branch3_creates_new_passwordless_user(db_session):
    claims = {
        "sub": "sub-3",
        "email": "new@example.com",
        "email_verified": True,
        "name": "New",
    }
    got = resolve_google_user(db_session, claims)
    assert got.id is not None
    assert got.email == "new@example.com"
    assert got.google_sub == "sub-3"
    assert got.password_hash is None
    assert got.name == "New"
    assert got.email_verified is True


def test_google_account_is_not_required_to_verify(client, monkeypatch):
    """A Google sign-in never hits the email-verification gate."""
    monkeypatch.setattr(auth_mod.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_mod.settings, "google_client_secret", "secret")

    async def fake_exchange(request):
        return {
            "userinfo": {
                "sub": "google-verified",
                "email": "gv@example.com",
                "email_verified": True,
                "name": "GV",
            }
        }

    monkeypatch.setattr(auth_mod.oauth.google, "authorize_access_token", fake_exchange)
    resp = client.get("/auth/google/callback", follow_redirects=False)
    assert resp.status_code == 303
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email_verified"] is True


def test_branch4_unverified_email_refused(db_session):
    claims = {"sub": "sub-4", "email": "x@example.com", "email_verified": False}
    with pytest.raises(HTTPException) as exc:
        resolve_google_user(db_session, claims)
    assert exc.value.status_code == 400


def test_unverified_email_does_not_link_existing_account(db_session):
    user = User(email="target@example.com", password_hash=hash_password("password-123"))
    db_session.add(user)
    db_session.commit()

    claims = {"sub": "sub-5", "email": "target@example.com", "email_verified": False}
    with pytest.raises(HTTPException):
        resolve_google_user(db_session, claims)

    db_session.refresh(user)
    assert user.google_sub is None
    assert user.password_hash is not None


def test_missing_subject_refused(db_session):
    with pytest.raises(HTTPException) as exc:
        resolve_google_user(db_session, {"email": "x@example.com", "email_verified": True})
    assert exc.value.status_code == 400


def test_google_login_disabled_returns_400(client):
    resp = client.get("/auth/google/login", follow_redirects=False)
    assert resp.status_code == 400


def test_google_redirect_uri_uses_public_base_url(client, monkeypatch):
    """The OAuth callback is derived from BASE_URL, the public frontend origin.

    With the frontend on Vercel and BASE_URL set to that origin, Google returns
    to ``<BASE_URL>/auth/google/callback`` (proxied to the API), so the session
    cookie is set on the frontend host and the post-login redirect stays there.
    """
    monkeypatch.setattr(auth_mod.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_mod.settings, "google_client_secret", "secret")
    monkeypatch.setattr(auth_mod.settings, "base_url", "https://daylog.vercel.app")

    captured: dict[str, str] = {}

    async def fake_authorize_redirect(request, redirect_uri):
        from starlette.responses import RedirectResponse

        captured["redirect_uri"] = redirect_uri
        return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth")

    monkeypatch.setattr(
        auth_mod.oauth.google, "authorize_redirect", fake_authorize_redirect
    )

    resp = client.get("/auth/google/login", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert captured["redirect_uri"] == "https://daylog.vercel.app/auth/google/callback"


def test_google_callback_sets_session(client, monkeypatch):
    monkeypatch.setattr(auth_mod.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_mod.settings, "google_client_secret", "secret")

    async def fake_exchange(request):
        return {
            "userinfo": {
                "sub": "google-abc",
                "email": "callback@example.com",
                "email_verified": True,
                "name": "Callback",
            }
        }

    monkeypatch.setattr(auth_mod.oauth.google, "authorize_access_token", fake_exchange)

    resp = client.get("/auth/google/callback", follow_redirects=False)
    assert resp.status_code == 303
    assert resp.headers["location"] == "/"
    assert "daylog_session" in resp.headers.get("set-cookie", "")

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "callback@example.com"


def test_google_callback_failure_returns_400(client, monkeypatch):
    monkeypatch.setattr(auth_mod.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_mod.settings, "google_client_secret", "secret")

    async def boom(request):
        raise RuntimeError("network down")

    monkeypatch.setattr(auth_mod.oauth.google, "authorize_access_token", boom)
    resp = client.get("/auth/google/callback", follow_redirects=False)
    assert resp.status_code == 400


def test_auth_config_shows_google_when_configured(client, monkeypatch):
    monkeypatch.setattr(auth_mod.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_mod.settings, "google_client_secret", "secret")
    resp = client.get("/auth/config")
    assert resp.json() == {"google_enabled": True, "email_enabled": False}
