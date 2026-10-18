"""The BYOK "Test key" endpoint and the promise that a key never leaks."""

from helpers import FakeResponse, patch_httpx, signup_verified


def signup(client, email="byok@example.com", password="password-123"):
    return signup_verified(client, email, password).json()


SECRET = "sk-test-SECRET123"


def test_check_requires_auth(client):
    assert client.post("/llm/check", headers={"X-LLM-Key": SECRET}).status_code == 401


def test_check_without_key(client):
    signup(client)
    resp = client.post("/llm/check")
    assert resp.status_code == 200
    assert resp.json()["ok"] is False


def test_check_valid_key(client, monkeypatch):
    signup(client)
    patch_httpx(monkeypatch, FakeResponse(status_code=200, payload={}))
    resp = client.post(
        "/llm/check", headers={"X-LLM-Provider": "gemini", "X-LLM-Key": SECRET}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"ok": True, "provider": "gemini", "message": "Key works"}
    assert SECRET not in resp.text


def test_check_rejected_key(client, monkeypatch):
    signup(client)
    patch_httpx(monkeypatch, FakeResponse(status_code=401, payload={}))
    resp = client.post(
        "/llm/check", headers={"X-LLM-Provider": "groq", "X-LLM-Key": SECRET}
    )
    assert resp.json()["ok"] is False
    assert SECRET not in resp.text


def test_check_unknown_provider(client):
    signup(client)
    resp = client.post(
        "/llm/check", headers={"X-LLM-Provider": "openai", "X-LLM-Key": SECRET}
    )
    assert resp.json()["ok"] is False
    assert "Unknown provider" in resp.json()["message"]
    assert SECRET not in resp.text


def test_check_rate_limited(client, monkeypatch):
    signup(client)
    patch_httpx(monkeypatch, FakeResponse(status_code=200, payload={}))
    headers = {"X-LLM-Provider": "gemini", "X-LLM-Key": SECRET}
    for _ in range(10):
        assert client.post("/llm/check", headers=headers).status_code == 200
    assert client.post("/llm/check", headers=headers).status_code == 429


def test_key_never_leaks_when_provider_fails(client, monkeypatch):
    signup(client)
    patch_httpx(monkeypatch, exc=RuntimeError("boom"))
    resp = client.post(
        "/logs",
        json={"raw_text": "secret work"},
        headers={"X-LLM-Provider": "gemini", "X-LLM-Key": SECRET},
    )
    # Falls back gracefully and the key is nowhere in the response body.
    assert resp.status_code == 201
    assert resp.json()["used"] == "fallback"
    assert SECRET not in resp.text


def test_key_never_leaks_when_key_rejected(client, monkeypatch):
    signup(client)
    patch_httpx(monkeypatch, FakeResponse(status_code=401, payload={"error": "bad key"}))
    resp = client.post(
        "/logs",
        json={"raw_text": "secret work"},
        headers={"X-LLM-Provider": "groq", "X-LLM-Key": SECRET},
    )
    assert resp.status_code == 201
    assert resp.json()["used"] == "fallback"
    assert SECRET not in resp.text
