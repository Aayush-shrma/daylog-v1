# DayLog

A website for the **#100DaysOfCode** crowd. Write a messy daily log and get:

- clean bullets plus an editable, tweet-ready draft (with a Copy button),
- a GitHub-style heatmap coloured by how much you did each day,
- a LeetCode-style streak (current and longest),
- day lookup — on day 100, instantly see what you did on day 10,
- keyword search over your past logs.

There is **no X/Twitter API**. You log inside DayLog and copy the text out.

## Stack

- **Backend:** FastAPI + SQLAlchemy 2.0 (sync), Python 3.11+.
- **Database:** Postgres (Neon) in production; SQLite for tests and local dev.
- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix) +
  Motion + cmdk + sonner, in `web/`. Built to `web/dist` and served by FastAPI
  from the **same origin**, so the httpOnly cookie and the CSRF Origin check keep
  working. Needs Node 20.19+/22.12+ (developed on Node 24).
- **Auth:** our own — email + password (argon2, email-verified) and "Continue with Google".
- **LLM:** one hosted provider (Gemini or Groq) via `httpx`, used in exactly one
  function (`clean_log`). Streaks, heatmap levels and counts are plain code.
- **BYOK:** any user can bring their own Gemini/Groq key. It lives in their
  browser and is sent per request in headers; the server never stores or logs it.

## Layout

```
daylog/
├── app/
│   ├── main.py          app, middleware, routers, /health, /
│   ├── config.py        pydantic-settings
│   ├── database.py      engine, SessionLocal, Base, get_db()
│   ├── migrations.py    small idempotent ALTERs for existing databases
│   ├── security.py      hashing, session cookie, get_current_user, origin check, rate limits
│   ├── timeutils.py     the user's local date (DEFAULT_TIMEZONE)
│   ├── models/          user.py, log.py, email_verification.py
│   ├── schemas/         user.py, log.py
│   ├── routers/         auth.py, logs.py, stats.py, llm.py
│   └── services/        llm.py, streaks.py, google.py, llm_usage.py,
│                        email.py, verification.py
├── web/                 React + Vite frontend (built to web/dist)
│   ├── src/             app shell, features (incl. auth/), ui components, lib
│   ├── index.html, vite.config.ts, vitest.config.ts, package.json
├── tests/               conftest.py + one file per area
├── scripts/smoke_test.py
├── requirements.txt, .env.example, Dockerfile, render.yaml
```

## Quick start (local)

```bash
cd daylog
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
copy .env.example .env            # Windows;  cp on macOS/Linux
```

Edit `.env` (see below), then build the frontend once and start the API:

```bash
cd web
npm install
npm run build          # writes web/dist
cd ..
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. Interactive API docs are at `/docs`.

### Frontend dev workflow

Pick one of these; both keep production untouched.

**A. Watch build (simplest — no proxy, no extra config).** FastAPI serves
`web/dist`, so just rebuild on change and refresh:

```bash
cd web
npm run build -- --watch     # rebuilds web/dist on every save
```

**B. Vite dev server + proxy (fast HMR).** Vite serves the app on
`http://localhost:5173` and proxies `/auth`, `/logs`, `/stats`, `/llm`, `/health`
to FastAPI on `:8000`. Because the browser's origin is now `:5173`, allow it for
unsafe (POST/PATCH/DELETE) requests via a **dev-only** setting:

```bash
# .env  (never set this in production)
DEV_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

```bash
# terminal 1
uvicorn app.main:app --reload
# terminal 2
cd web
npm run dev          # http://localhost:5173
```

`DEV_ALLOWED_ORIGINS` defaults to empty, so production only accepts `BASE_URL`'s
origin. Google sign-in redirects to `BASE_URL` (`:8000`), which is fine in dev.

For local development you can leave `DATABASE_URL` as the SQLite default
(`sqlite:///./daylog.db`) — the app creates the tables on startup. Point it at a
Neon **dev** branch when you want to match production.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `APP_NAME` | Shown in the UI/config. |
| `DEBUG` | `true` locally. Keep `false` in production. |
| `BASE_URL` | Public URL of the site — the origin the browser uses. Used for cookies, the Google redirect, the CSRF origin **and verification links**. Must be an absolute `http(s)` URL; use `https` in production. When the frontend is deployed separately (e.g. on Vercel), set this to the **frontend** origin. |
| `SECRET_KEY` | Signs the session JWT and the OAuth state. Must be a random string of **at least 32 characters**; with `DEBUG=false` or an `https` `BASE_URL` the app refuses to start with a default/short key. `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SESSION_DAYS` | Session lifetime in days (default 7). |
| `DATABASE_URL` | SQLAlchemy URL. Neon: `postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth. Leave empty to hide the Google button. |
| `EMAIL_BACKEND` | `smtp` or `resend`. Blank auto-detects (`RESEND_API_KEY` → resend, else `SMTP_HOST` → smtp). |
| `EMAIL_FROM` | The `From` address for verification emails (e.g. `no-reply@yourdomain.com`). Required for either backend. |
| `EMAIL_FROM_NAME` | Display name on the `From` header (default `DayLog`). |
| `EMAIL_TIMEOUT_SECONDS` | Provider request timeout (default 20). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | SMTP backend settings. |
| `SMTP_USE_TLS` / `SMTP_USE_SSL` | STARTTLS (default true) / implicit TLS (default false, e.g. port 465). |
| `RESEND_API_KEY` | Resend backend API key (https://resend.com). |
| `VERIFICATION_TOKEN_TTL_HOURS` | Verification-link lifetime (default 24). |
| `VERIFICATION_RESEND_COOLDOWN_SECONDS` | Minimum gap between resend requests per email (default 60). |
| `VERIFICATION_RESEND_WINDOW_SECONDS` / `VERIFICATION_RESEND_MAX_PER_WINDOW` | Resend limit per email/IP (default 5 per 900s). |
| `LLM_PROVIDER` | `gemini` or `groq`. |
| `LLM_API_KEY` | The **shared** server key (optional). Empty ⇒ always use the plain-code fallback. |
| `LLM_MODEL` | Optional model override. Defaults: `gemini-3.8-flash` / `llama-3.3-70b-versatile`. |
| `LLM_TIMEOUT_SECONDS` | Provider request timeout (default 20). |
| `DEFAULT_TIMEZONE` | The user's local date, e.g. `Asia/Kolkata`. Dates are never UTC dates. |
| `DEV_ALLOWED_ORIGINS` | Dev only. Extra origins allowed to make unsafe requests (the Vite dev server). Empty in production so only `BASE_URL`'s origin is accepted. |
| `FRONTEND_ORIGINS` | Production frontend origin(s) allowed to make unsafe (CSRF-checked) requests when the frontend is on a different origin than `BASE_URL` — e.g. a Vercel deployment and its preview URLs. Comma-separated, exact origins; no wildcards. Never put dev origins here. |
| `FORWARDED_ALLOW_IPS` | Docker image only. Proxies whose `X-Forwarded-For`/`-Proto` are trusted. Defaults to `127.0.0.1`; do **not** set `*` (a client could then spoof its IP and defeat the login rate limiter). Set it to your proxy's address if you need real client IPs. |
| `SMOKE_LLM_KEY` | Local smoke test only. Not used by the app. |

Never commit `.env` — it is gitignored.

## Google OAuth setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID → Web application**.
3. **Authorised redirect URIs** (add both):
   - `http://127.0.0.1:8000/auth/google/callback` (local)
   - `<BASE_URL>/auth/google/callback` (production, e.g. `https://daylog.onrender.com/auth/google/callback`)
4. Configure the **OAuth consent screen**; while it is in "Testing" add your own
   Google account under **Test users**.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   and set `BASE_URL` to the matching origin.

The callback uses `f"{BASE_URL}/auth/google/callback"` (not the request host),
so it stays correct behind a proxy.

Google is treated as a trusted identity provider: when it reports
`email_verified`, the local account is marked verified (and any password that
was set on a pre-registered, never-verified account is dropped when linking).

## Email verification

Email/password accounts must confirm their address before they can sign in:

1. `POST /auth/signup` creates the account **unverified**, stores only a
   SHA-256 hash of a random 256-bit token, and emails a link
   `«BASE_URL»/verify#token=…` (the token is in the URL fragment, so it never
   reaches server logs or `Referer` headers). No session cookie is set.
2. The SPA at `/verify` reads the fragment and `POST`s the token to
   `/auth/verify-email`. Success marks the account verified; expired / already
   used / invalid tokens each get a distinct message and a resend form.
3. `POST /auth/login` rejects an unverified account with `403` and
   `{"code": "email_not_verified"}` — no session is created. The UI offers
   "resend verification".
4. `POST /auth/resend-verification` always returns the same generic `202`
   (it never reveals whether an address has an account) and is rate limited.

`get_current_user` (used by every protected route) requires a *verified*
account, so an unverified session — including one issued before this change —
cannot reach `/logs`, `/stats`, `/llm` or `/auth/me`.

### Configuring an email provider

Set `EMAIL_BACKEND` plus **one** of:

- **Resend** — `RESEND_API_KEY` (HTTPS; the simplest option for this stack).
- **SMTP** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and the
  usual `SMTP_USE_TLS` / `SMTP_USE_SSL`.

Either way set `EMAIL_FROM` to an address on a domain you are allowed to send
from, and `EMAIL_FROM_NAME` if you want a friendly sender name.

If no provider is configured, signup still creates the account but the API
returns `verification_email_sent: false` with a message — the UI says the email
could not be sent and offers a resend. It never claims an email was delivered.

## Neon setup

1. Create a project at [neon.tech](https://neon.tech) and a **development branch**
   (plus a separate `production` branch).
2. Copy the connection string and change the prefix to `postgresql+psycopg://`,
   keeping `sslmode=require`:
   `postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require`
3. Put the **dev** string in your local `.env`; put the **production** string in
   the deploy environment. Never point local dev at production data.

The engine uses `pool_pre_ping=True` and `pool_recycle=300` because Neon scales
to zero and drops idle connections. Tables are created on startup
(`Base.metadata.create_all`) — fine for v1.

## LLM providers

The request formats were taken from the official docs:

- **Gemini** — `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`.
- **Groq** — `POST https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible), header `Authorization: Bearer <key>`.

Only these two fixed hosts are ever called; `provider` and `model` are validated
before use, so a user's key can never be sent to an attacker's server.

## Bring your own key (BYOK)

Open **Settings → Bring your own key** in the UI, pick a provider, paste a key,
optionally a model, choose "Remember on this device" (`localStorage`, otherwise
`sessionStorage`), then **Save key** / **Test key** / **Clear key**. Saved keys
show only their last 4 characters.

On `POST /logs`, `POST /logs/{id}/regenerate` and `POST /llm/check` the browser
sends `X-LLM-Provider`, `X-LLM-Key` and optional `X-LLM-Model`. Priority per
request: **the user's key → the server's `LLM_API_KEY` → the plain-code
fallback**. Keys are never stored, logged, echoed or placed in a URL.

Calls that use the **server's** key are capped at 20 per user per day; past that
the app falls back and asks you to add your own key.

## Testing

```bash
pytest                    # backend
cd web && npm test        # frontend: heatmap/streak + auth validation (Vitest)
```

Backend tests use a throwaway SQLite file and never touch the network, Neon,
Google, SMTP/Resend or an LLM (those are mocked). `tests/test_verification.py`
covers token issue → send → verify, single-use/replay rejection, expiry,
resend rate limiting/anti-enumeration, the sign-in gate and the protected-route
gate; `tests/test_migrations.py` covers the legacy backfill. The heatmap column
builder — including month spacers, partial first/last columns, a year boundary
and today on each weekday — and the sign-up/sign-in validators are covered by
the Vitest suite (the tests that used to shell out to a Node script were
replaced by it). The tests that exercise the served frontend skip when
`web/dist` has not been built.

Smoke test against a running server:

```bash
# in one terminal
uvicorn app.main:app --reload
# in another
python scripts/smoke_test.py
```

It signs up a throwaway user and exercises the signup / verification / sign-in
flow, prints PASS/FAIL per step. Set `SMOKE_EMAIL` / `SMOKE_PASSWORD` to a
**verified** account to also run the authenticated `logs`/`stats`/BYOK checks
(they are skipped otherwise). The throwaway account is intentionally left
unverified — a self-delete would need a session, which needs verification.

## Deploy (Render)

`render.yaml` and the multi-stage `Dockerfile` are included. Stage 1 builds
`web/` with Node and produces `web/dist`; stage 2 installs the Python deps and
copies that `dist` in, so no frontend build happens on the host and
`node_modules`/`dist` are never committed. Start command:

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
```

Set the env vars from the table above (`BASE_URL` = the public https URL,
`SECRET_KEY`, `DATABASE_URL` = the Neon **production** branch with
`postgresql+psycopg://` + `sslmode=require`, `GOOGLE_CLIENT_ID/SECRET`, `LLM_*`,
`DEFAULT_TIMEZONE`). Leave `DEV_ALLOWED_ORIGINS` unset in production.

## Deploy the frontend to Vercel (same-origin proxy)

The frontend can be hosted on Vercel while the API stays on Render **without**
changing the session cookie. The frontend calls the API on its own origin;
`web/vercel.json` rewrites the API prefixes to Render, so the browser is
same-origin with Vercel and the httpOnly `SameSite=Lax` cookie keeps working.

**How it fits together**

- `/auth`, `/logs`, `/stats`, `/llm` and `/health` are proxied to Render.
- Everything else (`/`, `/verify`, `/assets/*`, fonts) is served statically by
  Vercel or falls back to `index.html`, so no frontend asset is ever sent to the
  backend.
- Vercel's `rewrites` proxy the request (method, body, `Cookie`) and pass
  `Set-Cookie` back, so the existing cookie flow is unchanged.

**Vercel project settings**

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `web` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | 22.x (or 24.x) |

`web/vercel.json` is read from that root directory. **Replace the backend host**
in each `destination` (`https://daylog.onrender.com` is a placeholder) with your
Render service URL. Vercel has no env var for a rewrite destination, so it must
be literal. No Vercel environment variables are required.

**Render environment variables** (set in the Render dashboard; `BASE_URL` is
`sync: false` in `render.yaml`)

- `BASE_URL` = the **Vercel** URL, e.g. `https://daylog.vercel.app`. This keeps
  the session cookie, the Google callback, the CSRF origin and the verification
  links all on the public frontend origin.
- `FRONTEND_ORIGINS` = optional extra origins, e.g. Vercel **preview** URLs
  (`https://<project>-git-<branch>.vercel.app`). The production Vercel origin is
  already allowed through `BASE_URL`; set this only if you use preview
  deployments or host the frontend on more than one origin. Comma-separated,
  exact origins only; no wildcards. Keep `DEV_ALLOWED_ORIGINS` unset here.

**Google OAuth** — add the Vercel callback to **Authorised redirect URIs** in the
Google Cloud Console:

```
https://<your-vercel-domain>/auth/google/callback
```

You can keep the Render callback URI as well. The flow is: the login link hits
`<Vercel>/auth/google/login` (proxied) → Google → back to the Vercel callback
(proxied) → the session cookie is set on the Vercel host and the user lands on
the Vercel app.

**Manual verification after deploy** (can't be tested locally): confirm the
proxy forwards `Set-Cookie` (log in and reload), the `Origin` header (a mutating
request succeeds), and the Google callback end to end.

**Known trade-offs of the proxy**

- Render sees the Vercel edge as the client, so the **IP half** of the login rate
  limiter keys on Vercel's addresses. The per-account (`email`) limit still
  protects individual accounts; keep `FORWARDED_ALLOW_IPS` narrow and only trust
  a proxy you control.
- The backend's security headers (CSP, `Referrer-Policy`, …) do not apply to the
  HTML Vercel serves statically. Add matching `headers` in `vercel.json` if you
  need them.
- No `CORSMiddleware` is added on purpose: the browser is same-origin with
  Vercel, so no CORS preflight is involved.

## Not in v1

- Password reset (needs an email service; verification email is now supported).
- Image cards, public profiles, weekly recaps, tags, GitHub import, spaced
  repetition.

## Screenshots

_Add screenshots here._
