"""LLM routes. The only endpoint here is the BYOK "Test key" check.

The key travels as request headers only: it is never stored, logged, echoed or
put in a URL, and it is forwarded only to the fixed provider endpoint.
"""

from fastapi import APIRouter, Depends, Header, HTTPException

from ..config import settings
from ..models import User
from ..security import get_current_user, key_check_limiter
from ..services.llm import ALLOWED_PROVIDERS, LLMCreds, check_key

router = APIRouter(prefix="/llm", tags=["llm"])


def byok_creds(
    x_llm_provider: str | None = Header(default=None),
    x_llm_key: str | None = Header(default=None),
    x_llm_model: str | None = Header(default=None),
) -> LLMCreds | None:
    """Read the user's own key from headers, if present."""
    if not x_llm_key:
        return None
    provider = (x_llm_provider or settings.llm_provider or "").strip().lower()
    return LLMCreds(
        provider=provider,
        api_key=x_llm_key,
        model=(x_llm_model or "").strip(),
        source="user",
    )


@router.post("/check")
def check(
    creds: LLMCreds | None = Depends(byok_creds),
    user: User = Depends(get_current_user),
) -> dict:
    if creds is None:
        return {"ok": False, "provider": "", "message": "No key provided"}
    if creds.provider not in ALLOWED_PROVIDERS:
        return {
            "ok": False,
            "provider": creds.provider,
            "message": "Unknown provider (use gemini or groq)",
        }

    if key_check_limiter.is_blocked(str(user.id)):
        raise HTTPException(status_code=429, detail="Too many key checks. Try again later.")
    key_check_limiter.record_failure(str(user.id))

    ok = check_key(creds)
    return {
        "ok": ok,
        "provider": creds.provider,
        "message": "Key works" if ok else "Key was rejected by the provider",
    }
