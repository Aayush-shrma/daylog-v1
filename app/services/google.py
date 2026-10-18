"""Resolve a Google account into a local user.

Kept as a pure function (no OAuth, no network) so it can be unit tested.
Google is a trusted identity provider: when it reports ``email_verified`` we
mark the local account verified, because Google has proven control of that
address. Email/password accounts are *not* forced through Google.
"""

import datetime as dt

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import User


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def resolve_google_user(db: Session, claims: dict) -> User:
    """Map Google ID-token claims to a User, creating or linking as needed.

    Branches:
      1. a user already has this google_sub -> reuse it
      2. the email is verified and a local user has it -> link (+ drop password)
      3. otherwise -> create a new passwordless user
      4. email not verified -> 400
    """
    sub = (claims.get("sub") or "").strip()
    email = (claims.get("email") or "").strip().lower()
    email_verified = bool(claims.get("email_verified"))
    name = claims.get("name")

    if not sub:
        raise HTTPException(status_code=400, detail="Google account has no subject")

    # 1. Known Google account.
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is not None:
        # The provider already proved this address; keep the flag in sync (e.g.
        # an account created before verification existed).
        if not user.email_verified:
            user.email_verified = True
            user.email_verified_at = _utcnow()
            db.commit()
            db.refresh(user)
        return user

    # 4. Refuse unverified emails before linking or creating.
    if not email_verified:
        raise HTTPException(
            status_code=400, detail="Google account email is not verified"
        )
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    # 2. Link to an existing email account. Google has verified the address, so
    #    the account becomes verified — but the old password is dropped: a
    #    pre-registered account (which never proved ownership) must not keep
    #    password access to this identity.
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        user.google_sub = sub
        user.password_hash = None
        user.email_verified = True
        user.email_verified_at = _utcnow()
        if name and not user.name:
            user.name = name
        db.commit()
        db.refresh(user)
        return user

    # 3. Brand new account.
    user = User(
        email=email,
        google_sub=sub,
        name=name,
        password_hash=None,
        email_verified=True,
        email_verified_at=_utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
