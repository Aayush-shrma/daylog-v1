"""Email-verification tokens: issue, send and consume.

Raw tokens are 256-bit URL-safe random strings (:func:`secrets.token_urlsafe`),
so they are unpredictable. Only their SHA-256 hash is stored; a database dump
therefore does not yield usable links. Tokens expire and are single-use:
consumption is an atomic ``UPDATE … WHERE consumed_at IS NULL`` so two
concurrent requests can never both succeed.

The verification link targets the frontend with the token in the URL
*fragment* (``#token=…``). Fragments are never sent to the server, so the token
does not appear in access logs or ``Referer`` headers; the SPA submits it in a
POST body instead.
"""

import datetime as dt
import hashlib
import html
import logging
import secrets
from urllib.parse import quote

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..models import EmailVerificationToken, User
from .email import EmailError, send_email

logger = logging.getLogger("daylog.verification")

_TOKEN_BYTES = 32

RESULT_OK = "ok"
RESULT_INVALID = "invalid"
RESULT_EXPIRED = "expired"
RESULT_USED = "used"


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _as_utc(value: dt.datetime | None) -> dt.datetime | None:
    """SQLite hands back naive datetimes; Postgres returns aware ones."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_verification_url(token: str) -> str:
    """Build the link from the configured BASE_URL, never the request Host."""
    base = settings.base_url.rstrip("/")
    return f"{base}/verify#token={quote(token, safe='')}"


def issue_verification_token(db: Session, user: User) -> str:
    """Invalidate outstanding tokens and create a fresh one. Caller commits."""
    now = _utcnow()
    # Rotate: once a new link is issued, older unused links stop working.
    db.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + dt.timedelta(hours=settings.verification_token_ttl_hours),
            created_at=now,
        )
    )
    db.flush()
    return token


def send_verification_link(user: User, token: str) -> bool:
    """Email the link. Returns False (never raises) when delivery fails."""
    url = build_verification_url(token)
    hours = settings.verification_token_ttl_hours
    name = html.escape(user.name or "there")
    subject = "Verify your DayLog email"
    text_body = (
        f"Hi {user.name or 'there'},\n\n"
        "Confirm this email address to finish setting up your DayLog account:\n\n"
        f"{url}\n\n"
        f"This link expires in {hours} hours and can be used once. "
        "If you did not create a DayLog account, you can safely ignore this "
        "email.\n"
    )
    html_body = (
        '<div style="font-family:ui-sans-serif,system-ui,sans-serif;'
        'background:#09090b;padding:32px;color:#f4f4f5">'
        '<div style="max-width:480px;margin:0 auto;background:#101013;'
        'border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px">'
        f'<p style="margin:0 0 16px">Hi {name},</p>'
        '<p style="margin:0 0 20px;color:#a1a1aa">Confirm this email address '
        "to finish setting up your DayLog account.</p>"
        f'<p style="margin:0 0 24px"><a href="{html.escape(url, quote=True)}" '
        'style="display:inline-block;background:#10b981;color:#04140d;'
        'font-weight:600;padding:12px 20px;border-radius:12px;'
        'text-decoration:none">Verify email</a></p>'
        f'<p style="margin:0;color:#71717a;font-size:13px">This link expires in '
        f"{hours} hours and can be used once. If you did not create a DayLog "
        "account, you can safely ignore this email.</p>"
        "</div></div>"
    )
    try:
        send_email(
            to=user.email, subject=subject, text_body=text_body, html_body=html_body
        )
        return True
    except EmailError as exc:
        # Generic reason only: never the token, the link or provider payload.
        logger.warning("verification email not sent for user %s: %s", user.id, exc)
        return False


def verify_token(db: Session, token: str) -> tuple[bool, str]:
    """Consume a token and mark its user verified.

    Returns ``(ok, reason)`` where reason is one of ``ok``, ``invalid``,
    ``expired`` or ``used``. Marks the account verified only on success.
    """
    now = _utcnow()
    row = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(token)
        )
    )
    if row is None:
        return False, RESULT_INVALID
    if row.consumed_at is not None:
        return False, RESULT_USED
    expires_at = _as_utc(row.expires_at)
    if expires_at is not None and expires_at <= now:
        return False, RESULT_EXPIRED

    # Atomic single-use claim: only one concurrent request can match.
    claimed = db.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.id == row.id,
            EmailVerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    if claimed.rowcount != 1:
        db.rollback()
        return False, RESULT_USED

    db.execute(
        update(User)
        .where(User.id == row.user_id, User.email_verified.is_(False))
        .values(email_verified=True, email_verified_at=now)
    )
    db.commit()
    return True, RESULT_OK
