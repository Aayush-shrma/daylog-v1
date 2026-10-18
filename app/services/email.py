"""Outbound email for verification links.

Two backends, both driven entirely by configuration:

* ``resend`` — the Resend HTTP API (https://resend.com/docs/api-reference),
  called over ``httpx`` like the LLM providers already are.
* ``smtp``   — any SMTP provider via the standard library (Gmail app
  passwords, Postmark, Mailgun, SES, …).

If neither is configured, :func:`send_email` raises :class:`EmailError`.
Callers must treat that as "not sent" and never tell the user otherwise.
Provider credentials, recipient addresses and verification links/tokens are
never written to a log line.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from ..config import settings

logger = logging.getLogger("daylog.email")

_RESEND_URL = "https://api.resend.com/emails"


class EmailError(RuntimeError):
    """Raised when a message could not be handed to the email provider."""


def email_configured() -> bool:
    return settings.email_enabled


def _from_header() -> str:
    address = settings.email_from.strip()
    name = settings.email_from_name.strip()
    if name and address and "<" not in address:
        return f"{name} <{address}>"
    return address


def send_email(
    *,
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    """Deliver one email, or raise :class:`EmailError`."""
    backend = settings.email_backend_name
    if backend == "resend":
        _send_resend(to=to, subject=subject, text_body=text_body, html_body=html_body)
    elif backend == "smtp":
        _send_smtp(to=to, subject=subject, text_body=text_body, html_body=html_body)
    else:
        raise EmailError(
            "No email backend is configured "
            "(set EMAIL_BACKEND with SMTP_* or RESEND_API_KEY, and EMAIL_FROM)"
        )


def _send_resend(
    *, to: str, subject: str, text_body: str, html_body: str | None
) -> None:
    payload: dict[str, object] = {
        "from": _from_header(),
        "to": [to],
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body
    try:
        response = httpx.post(
            _RESEND_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=settings.email_timeout_seconds,
        )
    except Exception as exc:  # network, DNS, timeout, …
        raise EmailError(f"resend request failed: {type(exc).__name__}") from exc
    if response.status_code >= 400:
        # Only the status is surfaced: the body can echo the recipient.
        raise EmailError(f"resend rejected the message (HTTP {response.status_code})")


def _send_smtp(
    *, to: str, subject: str, text_body: str, html_body: str | None
) -> None:
    message = EmailMessage()
    message["From"] = _from_header()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    try:
        if settings.smtp_use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.email_timeout_seconds,
                context=context,
            )
        else:
            server = smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.email_timeout_seconds,
            )
        with server:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                server.starttls(context=context)
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:
        raise EmailError(f"smtp delivery failed: {type(exc).__name__}") from exc
