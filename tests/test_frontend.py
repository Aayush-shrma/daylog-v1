"""The built React frontend (web/dist) is served by FastAPI.

These tests skip when the bundle has not been built, so `pytest` stays green on a
backend-only checkout. Build it with `npm --prefix web run build`.
"""

import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "web" / "dist" / "index.html"

needs_build = pytest.mark.skipif(
    not INDEX.is_file(), reason="web/dist not built (run: npm --prefix web run build)"
)


@needs_build
def test_index_served(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "DayLog" in resp.text
    # Hashed Vite assets, loaded from our own origin (CSP is script-src 'self').
    assert "/assets/" in resp.text
    assert "<script>" not in resp.text


@needs_build
def test_spa_fallback_serves_index_for_client_routes(client):
    resp = client.get("/some/client/side/route")
    assert resp.status_code == 200
    assert "/assets/" in resp.text


@needs_build
def test_unknown_api_route_is_404_not_index(client):
    resp = client.get("/auth/does-not-exist")
    assert resp.status_code == 404


@needs_build
def test_missing_asset_is_404(client):
    assert client.get("/assets/does-not-exist.js").status_code == 404


@needs_build
def test_index_has_security_headers(client):
    resp = client.get("/")
    assert resp.headers["x-content-type-options"] == "nosniff"
    csp = resp.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    # Scripts must stay strict; only style *attributes* are allowed inline.
    assert "script-src 'self'" in csp
    assert "script-src 'self' 'unsafe-inline'" not in csp


def test_node_artifacts_are_gitignored():
    text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "node_modules" in text
    assert "dist" in text
