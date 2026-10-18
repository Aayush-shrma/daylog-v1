"""User model."""

import datetime as dt
import uuid

from sqlalchemy import Boolean, Date, DateTime, String, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from ..timeutils import local_today


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    # Nullable: Google-only accounts have no password.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    # First name. Kept on the existing `name` column.
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Email/password accounts start unverified and must confirm their email.
    # Google accounts are verified from the provider's claims.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    email_verified_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    start_date: Mapped[dt.date] = mapped_column(Date, default=local_today)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc)
    )

    # ORM-level cascade so deletes work on SQLite too (where FK enforcement
    # is off by default); the DB-level ON DELETE CASCADE still covers Postgres.
    logs = relationship("Log", back_populates="user", cascade="all, delete-orphan")
    verification_tokens = relationship(
        "EmailVerificationToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
