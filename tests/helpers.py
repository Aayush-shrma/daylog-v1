"""Test helpers.

* A fake httpx module so no LLM/provider call leaves the machine.
* An in-memory email capture so verification links can be asserted without a
  real email provider.
"""

import re
import urllib.parse

from app.services import llm

# --- fake httpx (LLM providers) ---------------------------------------------

class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeHttpx:
    def __init__(self, response=None, exc=None):
        self.response = response
        self.exc = exc
        self.calls = []

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        if self.exc is not None:
            raise self.exc
        return self.response


def patch_httpx(monkeypatch, response=None, exc=None) -> FakeHttpx:
    fake = FakeHttpx(response=response, exc=exc)
    monkeypatch.setattr(llm, "httpx", fake)
    return fake


# --- email capture ----------------------------------------------------------

# Populated by the `fake_email` fixture (see conftest.py).
EMAILS: list[dict] = []


def fake_send_email(*, to, subject, text_body, html_body=None):
    """Stand-in for app.services.email.send_email that records messages."""
    EMAILS.append(
        {"to": to, "subject": subject, "text": text_body, "html": html_body}
    )


class EmailSink:
    """Callable that fails like an unconfigured/broken provider."""

    def __init__(self, message="provider unavailable"):
        self.message = message

    def __call__(self, *, to, subject, text_body, html_body=None):
        from app.services.email import EmailError

        raise EmailError(self.message)


_VERIFY_RE = re.compile(r"/verify#token=([^\s<>\"']+)")


def token_from_email(text: str) -> str:
    match = _VERIFY_RE.search(text or "")
    assert match, "no verification link found in the email body"
    return urllib.parse.unquote(match.group(1))


def last_email() -> dict:
    assert EMAILS, "no email was sent"
    return EMAILS[-1]


def last_verification_token() -> str:
    return token_from_email(last_email()["text"])


# --- account helpers --------------------------------------------------------

def signup_payload(email, password="password-123", first_name="Test"):
    return {
        "first_name": first_name,
        "email": email,
        "password": password,
        "confirm_password": password,
    }


def signup_unverified(client, email, password="password-123", first_name="Test"):
    """Raw signup: no session, account stays unverified."""
    resp = client.post(
        "/auth/signup", json=signup_payload(email, password, first_name)
    )
    assert resp.status_code == 201, resp.text
    return resp


def signup_verified(client, email, password="password-123", first_name="Test"):
    """Sign up, consume the emailed token, then log in. Returns the login response."""
    signup_unverified(client, email, password, first_name)
    token = last_verification_token()
    verified = client.post("/auth/verify-email", json={"token": token})
    assert verified.status_code == 200, verified.text
    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login
