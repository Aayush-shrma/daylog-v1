"""Email verification: token generation, delivery, enforcement and resend."""

import datetime as dt

from sqlalchemy import select, update

from app.database import SessionLocal
from app.models import EmailVerificationToken, User
from app.security import COOKIE_NAME, create_session_token, hash_password
from helpers import (
    EMAILS,
    EmailSink,
    last_email,
    last_verification_token,
    signup_payload,
    signup_unverified,
)

PASSWORD = "password-123"
EMAIL = "verify@example.com"


def _user(db, email=EMAIL):
    return db.scalar(select(User).where(User.email == email))


# --- registration ------------------------------------------------------------

def test_successful_registration_sends_email_and_no_session(client):
    resp = signup_unverified(client, EMAIL, PASSWORD, "Ada")
    body = resp.json()
    assert body["user"]["name"] == "Ada"
    assert body["user"]["email_verified"] is False
    assert body["verification_email_sent"] is True
    assert not client.cookies.get(COOKIE_NAME)
    assert len(EMAILS) == 1
    assert EMAILS[0]["to"] == EMAIL
    assert "/verify#token=" in EMAILS[0]["text"]


def test_first_name_is_trimmed_and_persisted(client):
    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "  Grace  ",
            "email": EMAIL,
            "password": PASSWORD,
            "confirm_password": PASSWORD,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["user"]["name"] == "Grace"
    db = SessionLocal()
    try:
        assert _user(db).name == "Grace"
    finally:
        db.close()


def test_missing_fields_rejected(client):
    cases = [
        {"email": EMAIL, "password": PASSWORD, "confirm_password": PASSWORD},
        {"first_name": "A", "password": PASSWORD, "confirm_password": PASSWORD},
        {"first_name": "A", "email": EMAIL, "confirm_password": PASSWORD},
        {"first_name": "A", "email": EMAIL, "password": PASSWORD},
    ]
    for body in cases:
        assert client.post("/auth/signup", json=body).status_code == 422
    assert EMAILS == []


def test_blank_first_name_rejected(client):
    resp = client.post(
        "/auth/signup",
        json={"first_name": "   ", "email": EMAIL, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 422


def test_password_mismatch_rejected(client):
    resp = client.post(
        "/auth/signup",
        json={"first_name": "A", "email": EMAIL, "password": PASSWORD, "confirm_password": "different-1"},
    )
    assert resp.status_code == 422
    assert EMAILS == []


def test_invalid_email_rejected(client):
    resp = client.post(
        "/auth/signup",
        json={"first_name": "A", "email": "nope", "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 422


def test_short_password_rejected(client):
    resp = client.post(
        "/auth/signup",
        json={"first_name": "A", "email": EMAIL, "password": "short", "confirm_password": "short"},
    )
    assert resp.status_code == 422


def test_duplicate_email_rejected(client):
    signup_unverified(client, EMAIL, PASSWORD)
    resp = client.post("/auth/signup", json=signup_payload(EMAIL, PASSWORD))
    assert resp.status_code == 409


def test_password_stored_hashed_not_plaintext(client):
    signup_unverified(client, EMAIL, PASSWORD)
    db = SessionLocal()
    try:
        user = _user(db)
        assert user.password_hash and PASSWORD not in user.password_hash
        assert user.email_verified is False
    finally:
        db.close()


def test_token_stored_hashed_not_raw(client):
    signup_unverified(client, EMAIL, PASSWORD)
    raw = last_verification_token()
    db = SessionLocal()
    try:
        rows = list(db.scalars(select(EmailVerificationToken)))
        assert rows
        assert all(row.token_hash != raw for row in rows)
        assert all(len(row.token_hash) == 64 for row in rows)
        assert db.scalar(
            select(EmailVerificationToken).where(EmailVerificationToken.token_hash == raw)
        ) is None
    finally:
        db.close()


def test_verification_link_uses_configured_base_url(client):
    from app.config import settings

    signup_unverified(client, EMAIL, PASSWORD)
    assert f"{settings.base_url}/verify#token=" in last_email()["text"]


def test_verification_link_targets_public_frontend_origin(client, monkeypatch):
    """When BASE_URL is the public frontend origin (e.g. Vercel), the emailed
    link points at that origin's /verify SPA route, with the token in the
    fragment so it is never sent to the server."""
    from app.config import settings

    monkeypatch.setattr(settings, "base_url", "https://daylog.vercel.app")
    signup_unverified(client, EMAIL, PASSWORD)
    body = last_email()["text"]
    assert "https://daylog.vercel.app/verify#token=" in body
    # The token stays in the fragment and is submitted by the SPA in a POST body.
    assert "/verify?token=" not in body


# --- delivery failure --------------------------------------------------------

def test_delivery_failure_reported_not_claimed(client, monkeypatch):
    monkeypatch.setattr("app.services.verification.send_email", EmailSink("boom"))
    resp = signup_unverified(client, EMAIL, PASSWORD)
    body = resp.json()
    assert body["verification_email_sent"] is False
    assert body["message"]
    assert EMAILS == []
    db = SessionLocal()
    try:
        assert _user(db) is not None
        assert _user(db).email_verified is False
    finally:
        db.close()


def test_resend_delivery_failure_is_still_generic(client, monkeypatch):
    signup_unverified(client, EMAIL, PASSWORD)
    monkeypatch.setattr("app.services.verification.send_email", EmailSink())
    resp = client.post("/auth/resend-verification", json={"email": EMAIL})
    assert resp.status_code == 202  # failure/existence are not disclosed


# --- verification ------------------------------------------------------------

def test_successful_verification(client):
    signup_unverified(client, EMAIL, PASSWORD)
    token = last_verification_token()
    resp = client.post("/auth/verify-email", json={"token": token})
    assert resp.status_code == 200
    assert resp.json()["verified"] is True
    db = SessionLocal()
    try:
        user = _user(db)
        assert user.email_verified is True
        assert user.email_verified_at is not None
    finally:
        db.close()


def test_invalid_token_rejected(client):
    resp = client.post("/auth/verify-email", json={"token": "x" * 40})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid"


def test_expired_token_rejected(client):
    signup_unverified(client, EMAIL, PASSWORD)
    token = last_verification_token()
    db = SessionLocal()
    try:
        db.execute(
            update(EmailVerificationToken).values(
                expires_at=dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)
            )
        )
        db.commit()
    finally:
        db.close()
    resp = client.post("/auth/verify-email", json={"token": token})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "expired"


def test_token_cannot_be_reused(client):
    signup_unverified(client, EMAIL, PASSWORD)
    token = last_verification_token()
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    again = client.post("/auth/verify-email", json={"token": token})
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "used"


def test_short_token_rejected(client):
    assert client.post("/auth/verify-email", json={"token": "abc"}).status_code == 422


def test_two_sessions_cannot_both_consume(schema):
    """The conditional UPDATE makes consumption atomic across sessions."""
    from app.services.verification import issue_verification_token, verify_token

    s1 = SessionLocal()
    s2 = SessionLocal()
    try:
        user = User(email="race@example.com", name="Race", password_hash=hash_password(PASSWORD))
        s1.add(user)
        s1.commit()
        s1.refresh(user)
        token = issue_verification_token(s1, user)
        s1.commit()

        ok1, _ = verify_token(s1, token)
        ok2, reason2 = verify_token(s2, token)
        assert ok1 is True
        assert ok2 is False
        assert reason2 == "used"
    finally:
        s1.close()
        s2.close()


# --- sign-in enforcement -----------------------------------------------------

def test_unverified_login_rejected_with_helpful_code(client):
    signup_unverified(client, EMAIL, PASSWORD)
    resp = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "email_not_verified"
    assert not client.cookies.get(COOKIE_NAME)


def test_verified_login_succeeds(client):
    signup_unverified(client, EMAIL, PASSWORD)
    client.post("/auth/verify-email", json={"token": last_verification_token()})
    resp = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 200
    assert client.cookies.get(COOKIE_NAME)


def test_unverified_with_wrong_password_stays_generic(client):
    """A wrong password must not reveal that the account is unverified."""
    signup_unverified(client, EMAIL, PASSWORD)
    resp = client.post("/auth/login", json={"email": EMAIL, "password": "wrong"})
    assert resp.status_code == 401


def test_protected_api_blocks_previously_issued_unverified_session(client):
    signup_unverified(client, EMAIL, PASSWORD)
    db = SessionLocal()
    try:
        token = create_session_token(_user(db).id)
    finally:
        db.close()
    # A session token issued before verification must not grant access.
    client.cookies.set(COOKIE_NAME, token)
    for path in ("/auth/me", "/stats", "/logs"):
        resp = client.get(path)
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "email_not_verified"

    # Once verified, the very same token is accepted.
    db = SessionLocal()
    try:
        user = _user(db)
        user.email_verified = True
        db.commit()
    finally:
        db.close()
    assert client.get("/stats").status_code == 200
    assert client.get("/auth/me").json()["email_verified"] is True


def test_constructed_unverified_token_cannot_list_logs(client):
    """Manually building a token for an unverified user does not bypass the gate."""
    signup_unverified(client, EMAIL, PASSWORD)
    db = SessionLocal()
    try:
        token = create_session_token(_user(db).id)
    finally:
        db.close()
    resp = client.post(
        "/logs",
        json={"raw_text": "sneaky"},
        headers={"Cookie": f"{COOKIE_NAME}={token}"},
    )
    assert resp.status_code == 403


def test_existing_verified_session_still_works(client):
    signup_unverified(client, EMAIL, PASSWORD)
    client.post("/auth/verify-email", json={"token": last_verification_token()})
    assert client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    token = client.cookies.get(COOKIE_NAME)
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/auth/me").status_code == 200


# --- resend ------------------------------------------------------------------

def test_resend_sends_a_new_rotating_token(client):
    signup_unverified(client, EMAIL, PASSWORD)
    first = last_verification_token()
    resp = client.post("/auth/resend-verification", json={"email": EMAIL})
    assert resp.status_code == 202
    assert len(EMAILS) == 2
    second = last_verification_token()
    assert second != first
    # Rotating invalidates the earlier link.
    assert client.post("/auth/verify-email", json={"token": first}).status_code == 400
    assert client.post("/auth/verify-email", json={"token": second}).status_code == 200


def test_resend_for_unknown_email_is_generic(client):
    resp = client.post("/auth/resend-verification", json={"email": "ghost@example.com"})
    assert resp.status_code == 202
    assert EMAILS == []


def test_resend_does_not_reveal_existence(client):
    signup_unverified(client, EMAIL, PASSWORD)
    known = client.post("/auth/resend-verification", json={"email": EMAIL})
    unknown = client.post("/auth/resend-verification", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_resend_is_rate_limited_by_cooldown(client):
    assert client.post("/auth/resend-verification", json={"email": EMAIL}).status_code == 202
    assert client.post("/auth/resend-verification", json={"email": EMAIL}).status_code == 429
