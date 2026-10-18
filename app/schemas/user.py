"""Pydantic schemas for users."""

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from ..models import User

FIRST_NAME_MAX = 80
PASSWORD_MIN = 8
PASSWORD_MAX = 128


class SignupRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=FIRST_NAME_MAX)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    confirm_password: str = Field(min_length=1, max_length=PASSWORD_MAX)

    @field_validator("first_name")
    @classmethod
    def _clean_first_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("First name is required")
        if len(value) > FIRST_NAME_MAX:
            raise ValueError(
                f"First name must be at most {FIRST_NAME_MAX} characters"
            )
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> "SignupRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=512)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class StartDateUpdate(BaseModel):
    # `dt.date` (not `date`) so the field name cannot shadow the type.
    start_date: dt.date


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None = None
    start_date: dt.date
    has_password: bool
    email_verified: bool

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            start_date=user.start_date,
            has_password=user.password_hash is not None,
            email_verified=bool(user.email_verified),
        )


class SignupOut(BaseModel):
    """Signup response.

    Never sets a session cookie: the account cannot be used until the email is
    verified. ``verification_email_sent`` is false when the mail provider failed
    so the UI can say so honestly and offer a resend.
    """

    user: UserOut
    verification_email_sent: bool
    message: str | None = None
