"""Pydantic schemas for logs and LLM results."""

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class LogCreate(BaseModel):
    raw_text: str = Field(min_length=1, max_length=20000)
    # `dt.date` (not `date`) so the field name cannot shadow the type.
    date: dt.date | None = None


class LogUpdate(BaseModel):
    bullets: list[str] | None = None
    tweet_text: str | None = Field(default=None, max_length=280)


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: dt.date
    day_number: int
    raw_text: str
    bullets: list[str]
    tweet_text: str
    item_count: int


class LogResult(BaseModel):
    log: LogOut
    used: str
    notice: str | None = None


class CheckResult(BaseModel):
    ok: bool
    provider: str
    message: str
