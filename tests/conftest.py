"""Test configuration.

Environment variables are set *before* importing the app so Settings picks
them up. Tests use a throwaway SQLite file and never touch the network, Neon,
Google or an LLM provider.
"""

import os
import pathlib
import tempfile

_TEST_DB = pathlib.Path(tempfile.gettempdir()) / "daylog_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["BASE_URL"] = "http://127.0.0.1:8000"
os.environ["DEBUG"] = "false"
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["LLM_MODEL"] = ""
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["GOOGLE_CLIENT_SECRET"] = ""
os.environ["DEFAULT_TIMEZONE"] = "Asia/Kolkata"
os.environ["DEV_ALLOWED_ORIGINS"] = ""
os.environ["FRONTEND_ORIGINS"] = ""
os.environ["SMOKE_LLM_KEY"] = ""
os.environ["EMAIL_BACKEND"] = ""
os.environ["EMAIL_FROM"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["SMTP_HOST"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import reset_all_limiters  # noqa: E402
from app.services.llm_usage import server_key_usage  # noqa: E402


@pytest.fixture()
def schema():
    """A fresh schema for every test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The limiters are process-globals; reset them between tests."""
    reset_all_limiters()
    server_key_usage._counts.clear()
    yield
    reset_all_limiters()
    server_key_usage._counts.clear()


@pytest.fixture(autouse=True)
def fake_email(monkeypatch):
    """Capture outbound email; never touch a real provider."""
    from helpers import EMAILS, fake_send_email

    EMAILS.clear()
    monkeypatch.setattr("app.services.verification.send_email", fake_send_email)
    yield EMAILS
    EMAILS.clear()


@pytest.fixture()
def client(schema):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def make_client(schema):
    """Factory for extra TestClients with their own cookie jars (multi-user tests)."""
    created = []

    def _make():
        c = TestClient(app)
        created.append(c)
        return c

    yield _make
    for c in created:
        c.close()


@pytest.fixture()
def db_session(schema):
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def make_log(db_session):
    """Insert a Log row directly (the logs API arrives in Phase B)."""

    def _make(user_id, date, day_number=1, raw_text="did stuff"):
        import uuid as _uuid

        from app.models import Log

        log = Log(
            user_id=_uuid.UUID(str(user_id)),
            date=date,
            day_number=day_number,
            raw_text=raw_text,
            bullets=["a", "b"],
            tweet_text="Day 1: did stuff",
            item_count=2,
        )
        db_session.add(log)
        db_session.commit()
        db_session.refresh(log)
        return log

    return _make
