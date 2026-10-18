"""Password hashing, session cookies, the current-user dependency, the CSRF
origin check and the in-memory login rate limiter."""

import datetime as dt
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

COOKIE_NAME = "daylog_session"
JWT_ALGORITHM = "HS256"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_ph = PasswordHasher()
# Precomputed hash so unknown-user logins still pay the argon2 cost.
_DUMMY_HASH = _ph.hash("daylog-dummy-password")


# --- passwords ---------------------------------------------------------------

def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def dummy_verify() -> None:
    """Burn roughly the same time as a real check, for unknown emails."""
    try:
        _ph.verify(_DUMMY_HASH, "not-the-password")
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        pass


# --- session token -----------------------------------------------------------

def create_session_token(user_id: uuid.UUID) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + dt.timedelta(days=settings.session_days),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return uuid.UUID(str(sub))
    except ValueError:
        return None


def set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user_id),
        max_age=settings.session_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )


# Machine-readable code so the frontend can offer "resend verification"
# instead of treating the response as a generic error.
EMAIL_NOT_VERIFIED_CODE = "email_not_verified"


def email_not_verified_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": EMAIL_NOT_VERIFIED_CODE,
            "message": (
                "Please verify your email address before continuing. "
                "Check your inbox or request a new verification link."
            ),
        },
    )


def load_session_user(request: Request, db: Session) -> User:
    """Resolve the session cookie to a User, or raise 401.

    Used by ``get_current_user`` and available on its own for code paths that
    must distinguish "no session" (401) from "unverified" (403).
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise _unauthorized()
    user_id = decode_session_token(token)
    if user_id is None:
        raise _unauthorized()
    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """A fully-authenticated user: valid session *and* verified email.

    Every protected route depends on this, so an account that has not verified
    its email cannot reach protected APIs — including with a session token
    that was issued before verification was enforced.
    """
    user = load_session_user(request, db)
    if not user.email_verified:
        raise email_not_verified_error()
    return user


# --- CSRF origin check -------------------------------------------------------

def _origin_of(url: str) -> str:
    from urllib.parse import urlparse

    parts = urlparse(url)
    return f"{parts.scheme}://{parts.netloc}"


def _allowed_origins() -> set[str]:
    """Origins allowed to send unsafe requests.

    ``BASE_URL``'s origin, plus explicitly configured ``FRONTEND_ORIGINS``
    (production frontend, e.g. Vercel) and any dev-only origins (empty in
    production). Every entry is an exact origin; there are no wildcards, so an
    unconfigured site's Origin is still rejected.
    """
    allowed = {_origin_of(settings.base_url)}
    for setting in (settings.frontend_origins, settings.dev_allowed_origins):
        for raw in setting.split(","):
            origin = raw.strip()
            if origin:
                allowed.add(_origin_of(origin))
    return allowed


async def origin_check_middleware(request: Request, call_next):
    """Reject unsafe cross-origin requests when an Origin header is present."""
    if request.method in UNSAFE_METHODS:
        origin = request.headers.get("origin")
        if origin and _origin_of(origin) not in _allowed_origins():
            return JSONResponse(
                {"detail": "Cross-origin request rejected"}, status_code=403
            )
    return await call_next(request)


# --- login rate limiting -----------------------------------------------------
# In-memory only: fine for a single instance (v1). With multiple workers/instances
# each process would keep its own counters, so a shared store is needed later.
class LoginRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 900) -> None:
        self.max_attempts = max_attempts
        self.window = dt.timedelta(seconds=window_seconds)
        self._failures: dict[str, list[dt.datetime]] = {}

    def _recent(self, key: str, now: dt.datetime) -> list[dt.datetime]:
        return [t for t in self._failures.get(key, []) if now - t < self.window]

    def is_blocked(self, key: str) -> bool:
        now = dt.datetime.now(dt.timezone.utc)
        return len(self._recent(key, now)) >= self.max_attempts

    def record_failure(self, key: str) -> None:
        now = dt.datetime.now(dt.timezone.utc)
        recent = self._recent(key, now)
        recent.append(now)
        self._failures[key] = recent

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


login_limiter = LoginRateLimiter()

# Counts key-check requests per user (not failures); reuses the same window logic.
key_check_limiter = LoginRateLimiter(max_attempts=10, window_seconds=300)

# Resend-verification limits. Both count *every* request (whether or not the
# email belongs to an account) so the 429 never reveals account existence.
resend_limiter = LoginRateLimiter(
    max_attempts=settings.verification_resend_max_per_window,
    window_seconds=settings.verification_resend_window_seconds,
)
resend_cooldown = LoginRateLimiter(
    max_attempts=1, window_seconds=settings.verification_resend_cooldown_seconds
)


def reset_all_limiters() -> None:
    """Drop every limiter's state (used by tests)."""
    for limiter in (login_limiter, key_check_limiter, resend_limiter, resend_cooldown):
        limiter._failures.clear()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
