"""The lightweight schema migration for the email-verification columns."""

from sqlalchemy import create_engine, text

from app.migrations import run_migrations


def _legacy_engine(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id CHAR(36) PRIMARY KEY, "
                "email VARCHAR(320), "
                "password_hash VARCHAR(255), "
                "google_sub VARCHAR(255), "
                "name VARCHAR(255), "
                "start_date DATE, "
                "created_at DATETIME)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO users (id, email, google_sub, created_at) "
                "VALUES ('g', 'g@example.com', 'sub-g', '2026-01-01 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, created_at) "
                "VALUES ('e', 'e@example.com', 'argon2-hash', '2026-01-01 00:00:00')"
            )
        )
    return engine


def test_migration_adds_columns_and_backfills_only_google(tmp_path):
    engine = _legacy_engine(tmp_path)
    run_migrations(engine)
    run_migrations(engine)  # idempotent

    with engine.connect() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        assert "email_verified" in columns
        assert "email_verified_at" in columns
        google = conn.execute(
            text("SELECT email_verified FROM users WHERE id = 'g'")
        ).scalar()
        email = conn.execute(
            text("SELECT email_verified FROM users WHERE id = 'e'")
        ).scalar()

    # Google proved the address; the password account did not, so it stays
    # unverified rather than being silently marked as verified.
    assert google in (1, True)
    assert email in (0, False)
    engine.dispose()
