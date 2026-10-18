"""Lightweight, idempotent schema migrations.

The project has no Alembic setup: tables are created with
``Base.metadata.create_all`` on startup. ``create_all`` never ALTERs an
existing table, so columns added after the first deploy need one small
explicit step. This module keeps that in one place and works on both SQLite
(tests / local) and PostgreSQL (Neon).

It is safe to run on every startup: each change checks the current schema
first and the data backfill is idempotent.
"""

import logging

from sqlalchemy import Engine, inspect, text

logger = logging.getLogger("daylog.migrations")


def _column_names(engine: Engine, table: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def run_migrations(engine: Engine) -> None:
    """Bring an existing database up to the current schema.

    On a brand-new database ``create_all`` has already built the current
    schema, so every check below is a no-op.
    """
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = _column_names(engine, "users")
    dialect = engine.dialect.name
    added_verified = False

    with engine.begin() as conn:
        if "email_verified" not in columns:
            default = "false" if dialect == "postgresql" else "0"
            conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN email_verified "
                    f"BOOLEAN NOT NULL DEFAULT {default}"
                )
            )
            added_verified = True
            logger.info("migration: added users.email_verified")

        if "email_verified_at" not in columns:
            coltype = "TIMESTAMP WITH TIME ZONE" if dialect == "postgresql" else "DATETIME"
            conn.execute(
                text(f"ALTER TABLE users ADD COLUMN email_verified_at {coltype}")
            )
            logger.info("migration: added users.email_verified_at")

        # Backfill: only Google-linked accounts have a trustworthy proof of
        # email ownership. Email/password accounts stay unverified and must
        # confirm their address (the resend flow covers them).
        conn.execute(
            text(
                "UPDATE users SET email_verified = true, "
                "email_verified_at = COALESCE(email_verified_at, created_at, CURRENT_TIMESTAMP) "
                "WHERE google_sub IS NOT NULL AND email_verified = false"
            )
        )

    if added_verified:
        logger.info("migration: backfilled Google accounts as email-verified")
