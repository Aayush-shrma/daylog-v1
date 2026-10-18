# --- Stage 1: build the React frontend --------------------------------
FROM node:24-slim AS web

WORKDIR /web

# Install with the lockfile first, so this layer is cached when only source changes.
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build


# --- Stage 2: Python runtime serving the API and the built SPA ---------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    FORWARDED_ALLOW_IPS=127.0.0.1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=10001:10001 . .
# The compiled frontend from stage 1 (web/dist is git-ignored, never built on the host).
COPY --from=web --chown=10001:10001 /web/dist ./web/dist

# Never run the app as root. A numeric uid needs no /etc/passwd entry, and the
# app only reads its files at runtime (no bytecode, no local SQLite in prod).
USER 10001:10001

EXPOSE 8000

# --forwarded-allow-ips defaults to loopback: only a local proxy is trusted.
# With "*" a client could spoof X-Forwarded-For and defeat the login rate
# limiter. Set FORWARDED_ALLOW_IPS to your proxy's address if you need real IPs.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS}"
