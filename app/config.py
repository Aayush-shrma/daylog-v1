"""Application settings, loaded from environment / .env via pydantic-settings."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Placeholders that must never sign a production session cookie.
_WEAK_SECRETS = {"", "change-me", "changeme", "secret", "test", "daylog"}
_MIN_SECRET_LEN = 32


class Settings(BaseSettings):
    """All runtime configuration. Values come from env vars (which win) or .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "DayLog"
    debug: bool = True
    base_url: str = "http://127.0.0.1:8000"
    secret_key: str = "change-me"
    session_days: int = 7

    database_url: str = "sqlite:///./daylog.db"

    google_client_id: str = ""
    google_client_secret: str = ""

    llm_provider: str = "gemini"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_timeout_seconds: float = 20.0

    # --- email delivery (verification links) ---------------------------------
    # Backend is "smtp" or "resend". Leave empty to auto-detect: a Resend key
    # selects Resend, otherwise an SMTP host selects SMTP, otherwise email is
    # simply not configured and sends fail loudly instead of pretending.
    email_backend: str = ""
    email_from: str = ""          # e.g. no-reply@yourdomain.com
    email_from_name: str = "DayLog"
    email_timeout_seconds: float = 20.0

    # SMTP (any provider: Gmail app password, Postmark, Mailgun, SES, …)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True     # STARTTLS on submission ports (587)
    smtp_use_ssl: bool = False    # implicit TLS (e.g. port 465)

    # Resend (https://resend.com) HTTP API — fits the httpx-based stack.
    resend_api_key: str = ""

    # Email verification tokens.
    verification_token_ttl_hours: int = 24
    verification_resend_cooldown_seconds: int = 60
    verification_resend_window_seconds: int = 900
    verification_resend_max_per_window: int = 5

    default_timezone: str = "Asia/Kolkata"

    # Dev workflow only: extra browser origins allowed to send unsafe requests,
    # e.g. the Vite dev server at http://localhost:5173. Comma-separated.
    # Leave empty in production so only BASE_URL's origin is accepted.
    dev_allowed_origins: str = ""

    # Production frontend origins allowed to send unsafe (CSRF-checked)
    # requests, comma-separated and exact. Use this for a frontend hosted on a
    # different origin than BASE_URL — e.g. a Vercel deployment reached through a
    # proxy — including per-branch preview URLs. Deliberately separate from
    # DEV_ALLOWED_ORIGINS so the dev escape hatch never enables in production.
    frontend_origins: str = ""

    # Local smoke-testing only; never used by the app itself.
    smoke_llm_key: str = ""

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def email_backend_name(self) -> str:
        """Resolve the configured backend, or "" when email is unavailable."""
        backend = (self.email_backend or "").strip().lower()
        if backend:
            return backend
        if self.resend_api_key:
            return "resend"
        if self.smtp_host:
            return "smtp"
        return ""

    @property
    def email_enabled(self) -> bool:
        """True only when a backend is selected *and* has the needed config."""
        backend = self.email_backend_name
        if backend == "resend":
            return bool(self.resend_api_key and self.email_from)
        if backend == "smtp":
            return bool(self.smtp_host and self.email_from)
        return False

    @property
    def cookie_secure(self) -> bool:
        return self.base_url.startswith("https")

    @property
    def is_production(self) -> bool:
        """Production means DEBUG is off, or the app is served over https."""
        return not self.debug or self.base_url.startswith("https")

    @model_validator(mode="after")
    def _require_strong_secret_key(self) -> "Settings":
        """Refuse to start in production with a default or short SECRET_KEY.

        The key signs session cookies, so a guessable value lets anyone forge a
        login. Fail fast and loudly instead of running insecurely.
        """
        if not self.is_production:
            return self
        if (
            self.secret_key.strip().lower() in _WEAK_SECRETS
            or len(self.secret_key) < _MIN_SECRET_LEN
        ):
            raise ValueError(
                "SECRET_KEY must be a random string of at least "
                f"{_MIN_SECRET_LEN} characters when DEBUG is false or "
                "BASE_URL is https (refusing to start insecurely)"
            )
        return self

    @model_validator(mode="after")
    def _require_absolute_base_url(self) -> "Settings":
        """BASE_URL builds cookies, the Google redirect and verification links,
        so it must be an absolute http(s) URL — never a bare host or path."""
        url = (self.base_url or "").strip()
        if not url.startswith(("http://", "https://")):
            raise ValueError(
                "BASE_URL must be an absolute http(s) URL, "
                "e.g. https://daylog.example.com"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
