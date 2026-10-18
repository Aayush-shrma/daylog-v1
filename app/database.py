"""Engine, session factory and declarative base (SQLAlchemy 2.0 style)."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    url = settings.database_url
    if url.startswith("sqlite"):
        # SQLite is used only for tests / local fallback.
        return create_engine(url, connect_args={"check_same_thread": False})
    # Neon scales to zero and drops idle connections, so ping and recycle.
    return create_engine(url, pool_pre_ping=True, pool_recycle=300)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
