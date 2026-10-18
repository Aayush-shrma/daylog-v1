"""End-to-end smoke test against a *running* DayLog server (httpx only).

Always checks the email-verification flow with a throwaway, unverified account:
signup creates it without a session, sign-in is refused with ``403
email_not_verified``, bad verification tokens are rejected, resend returns a
generic ``202`` and every protected route returns ``401`` without a session.

The authenticated ``/auth/me``, ``/logs``, ``/stats`` and BYOK checks need a
*verified* account, so they only run when ``SMOKE_EMAIL`` / ``SMOKE_PASSWORD``
are set (that account is never deleted). ``SMOKE_LLM_KEY`` additionally enables
the BYOK checks.

Usage (server must already be running):
    set SMOKE_EMAIL=you@example.com        # optional, a verified account
    set SMOKE_PASSWORD=...                 # optional
    set SMOKE_LLM_KEY=...                  # optional
    python scripts/smoke_test.py

Env:
    SMOKE_BASE_URL      default http://127.0.0.1:8000
    SMOKE_EMAIL         optional verified account email
    SMOKE_PASSWORD      optional verified account password
    SMOKE_LLM_KEY       optional; enables the BYOK + /llm/check steps
    SMOKE_LLM_PROVIDER  default "gemini"

Note: the throwaway account is left unverified on purpose (a session, and so a
self-delete, needs verification) and cannot be removed through the API. Delete
it from your dev database if you like; it never touches production.
"""

import datetime as dt
import os
import sys
import uuid

import httpx

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:8000")
ACCOUNT_EMAIL = os.environ.get("SMOKE_EMAIL", "")
ACCOUNT_PASSWORD = os.environ.get("SMOKE_PASSWORD", "")
LLM_KEY = os.environ.get("SMOKE_LLM_KEY", "")
LLM_PROVIDER = os.environ.get("SMOKE_LLM_PROVIDER", "gemini")

COOKIE_NAME = "daylog_session"

_failures = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global _failures
    if not condition:
        _failures += 1
    mark = "PASS" if condition else "FAIL"
    suffix = f"  ({detail})" if detail else ""
    print(f"[{mark}] {name}{suffix}")


def detail_code(resp: httpx.Response) -> str | None:
    """Best-effort read of a ``{"code": ...}`` error detail (nested or flat)."""
    try:
        detail = resp.json().get("detail")
    except Exception:
        return None
    if isinstance(detail, dict):
        return detail.get("code")
    return None


def run_verification_flow(client: httpx.Client, email: str, password: str) -> None:
    print("-- Signup / verification flow --")

    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "Smoke",
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )
    body = resp.json() if resp.status_code in (200, 201) else {}
    check("POST /auth/signup", resp.status_code == 201, f"{resp.status_code}")
    check("signup returns no session cookie", COOKIE_NAME not in client.cookies)
    check(
        "signup reports unverified",
        body.get("user", {}).get("email_verified") is False,
        str(body.get("user", {}).get("email_verified")),
    )
    check(
        "signup reports whether the email was sent",
        isinstance(body.get("verification_email_sent"), bool),
        f"sent={body.get('verification_email_sent')}",
    )

    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "Smoke",
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )
    check("duplicate signup rejected", resp.status_code == 409, f"{resp.status_code}")

    resp = client.post(
        "/auth/signup",
        json={
            "first_name": "Smoke",
            "email": email.upper(),
            "password": password,
            "confirm_password": "different-password",
        },
    )
    check(
        "signup rejects mismatched passwords",
        resp.status_code == 422,
        f"{resp.status_code}",
    )

    resp = client.post("/auth/login", json={"email": email, "password": password})
    check(
        "unverified login refused",
        resp.status_code == 403 and detail_code(resp) == "email_not_verified",
        f"{resp.status_code} code={detail_code(resp)}",
    )
    check("unverified login sets no cookie", COOKIE_NAME not in client.cookies)

    resp = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    check("wrong password refused", resp.status_code == 401, f"{resp.status_code}")

    resp = client.post("/auth/verify-email", json={"token": "not-a-real-token"})
    check(
        "invalid verification token rejected",
        resp.status_code == 400 and detail_code(resp) == "invalid",
        f"{resp.status_code} code={detail_code(resp)}",
    )

    resp = client.post("/auth/resend-verification", json={"email": email})
    check(
        "resend for existing account is generic 202",
        resp.status_code == 202 and "message" in resp.json(),
        f"{resp.status_code}",
    )
    resp = client.post(
        "/auth/resend-verification", json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com"}
    )
    check(
        "resend for unknown account is also 202",
        resp.status_code == 202,
        f"{resp.status_code}",
    )

    for method, path in (("GET", "/auth/me"), ("GET", "/logs"), ("GET", "/stats")):
        resp = client.request(method, path)
        check(f"{method} {path} without session", resp.status_code == 401, f"{resp.status_code}")

    print(
        f"[NOTE] unverified throwaway account {email} was created and is left "
        "behind (a session, and so a self-delete, needs verification)."
    )


def run_authenticated_flow(client: httpx.Client) -> None:
    print("\n-- Authenticated flow (SMOKE_EMAIL given) --")
    today = dt.date.today()
    yesterday = today - dt.timedelta(days=1)

    resp = client.post(
        "/auth/login", json={"email": ACCOUNT_EMAIL, "password": ACCOUNT_PASSWORD}
    )
    body = resp.json() if resp.status_code == 200 else {}
    check("login", resp.status_code == 200, f"{resp.status_code}")
    if resp.status_code != 200:
        print("[SKIP] the rest of the authenticated flow (login failed)")
        return
    check("account is verified", body.get("email_verified") is True)
    check("login sets a session cookie", COOKIE_NAME in client.cookies)

    resp = client.get("/auth/me")
    check(
        "GET /auth/me",
        resp.status_code == 200 and resp.json()["email"] == ACCOUNT_EMAIL.lower(),
        f"{resp.status_code}",
    )

    resp = client.patch("/auth/me", json={"start_date": yesterday.isoformat()})
    check("PATCH /auth/me start_date", resp.status_code == 200, f"{resp.status_code}")

    resp = client.post(
        "/logs",
        json={"raw_text": "smoke test log\nsecond line", "date": today.isoformat()},
    )
    log_id = None
    if resp.status_code == 201:
        log_id = resp.json()["log"]["id"]
        check("POST /logs", True)
        check("POST /logs day_number", resp.json()["log"]["day_number"] == 2)
        check("POST /logs used is not empty", bool(resp.json()["used"]))
    elif resp.status_code == 409:
        # A re-run on a day that is already logged is fine; reuse the existing log.
        check("POST /logs (already logged today)", True)
        detail = resp.json().get("detail")
        if isinstance(detail, dict):
            log_id = detail.get("log_id")
    else:
        check("POST /logs", False, f"{resp.status_code}")

    resp = client.get("/logs/day/2")
    check("GET /logs/day/2", resp.status_code == 200, f"{resp.status_code}")

    if log_id is not None:
        resp = client.get("/logs", params={"q": "smoke"})
        check(
            "GET /logs?q=smoke",
            resp.status_code == 200 and any(item["id"] == log_id for item in resp.json()),
            f"{resp.status_code}",
        )

        resp = client.put(
            f"/logs/{log_id}",
            json={"bullets": ["smoke one", "smoke two"], "tweet_text": "Day 2: smoke"},
        )
        check(
            "PUT /logs/{id}",
            resp.status_code == 200 and resp.json()["item_count"] == 2,
            f"{resp.status_code}",
        )

    resp = client.get("/stats")
    stats_ok = resp.status_code == 200
    check("GET /stats", stats_ok, f"{resp.status_code}")
    if stats_ok:
        body = resp.json()
        check("stats heatmap length", len(body["heatmap"]) == 365)
        check("stats totals", body["total_days"] >= 1 and body["total_items"] >= 1)

    if LLM_KEY:
        headers = {"X-LLM-Provider": LLM_PROVIDER, "X-LLM-Key": LLM_KEY}
        resp = client.post("/llm/check", headers=headers)
        body = resp.json() if resp.status_code == 200 else {}
        check(
            "POST /llm/check (BYOK)",
            resp.status_code == 200 and body.get("ok") is True,
            f"{resp.status_code} {body.get('message', '')}".strip(),
        )
        check("key not echoed", LLM_KEY not in resp.text)

        resp = client.post(
            "/logs",
            json={"raw_text": "byok smoke log\nanother line", "date": yesterday.isoformat()},
            headers=headers,
        )
        if resp.status_code == 201:
            check("POST /logs with BYOK headers", True)
            check("BYOK call used the user key", resp.json()["used"] == "user")
            check("key not echoed", LLM_KEY not in resp.text)
        elif resp.status_code == 409:
            check("POST /logs with BYOK headers (already logged)", True)
        else:
            check("POST /logs with BYOK headers", False, f"{resp.status_code}")
    else:
        print("[SKIP] /llm/check and BYOK POST /logs (SMOKE_LLM_KEY is empty)")

    resp = client.post("/auth/logout")
    check("POST /auth/logout", resp.status_code == 200, f"{resp.status_code}")
    resp = client.get("/auth/me")
    check("session gone after logout", resp.status_code == 401, f"{resp.status_code}")


def main() -> int:
    email = f"smoke-{uuid.uuid4().hex[:12]}@example.com"
    password = "smoke-test-password-123"

    print(f"Smoke test against {BASE_URL}\n")

    with httpx.Client(base_url=BASE_URL, timeout=60) as client:
        resp = client.get("/health")
        check("/health", resp.status_code == 200 and resp.json().get("status") == "ok")

        run_verification_flow(client, email, password)

        client.cookies.clear()
        if ACCOUNT_EMAIL and ACCOUNT_PASSWORD:
            run_authenticated_flow(client)
        else:
            print(
                "\n[SKIP] authenticated /logs, /stats and BYOK checks "
                "(set SMOKE_EMAIL and SMOKE_PASSWORD to a verified account)."
            )

    print()
    if _failures:
        print(f"RESULT: FAIL ({_failures} check(s) failed)")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
