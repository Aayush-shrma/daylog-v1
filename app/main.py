"""FastAPI application entry point: middleware, routers, static files."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .database import Base, engine
from .migrations import run_migrations
from .routers import auth, llm, logs, stats
from .security import origin_check_middleware

# The React frontend is built to web/dist and served from FastAPI on the same
# origin, so the httpOnly session cookie and the CSRF Origin check keep working.
DIST_DIR = Path(__file__).resolve().parent.parent / "web" / "dist"
INDEX_FILE = DIST_DIR / "index.html"
ASSETS_DIR = DIST_DIR / "assets"
API_PREFIXES = ("auth", "logs", "stats", "llm", "health", "docs", "redoc", "openapi.json")

# script-src stays strict (no 'unsafe-inline'): the Vite bundle is external and
# hashed. style-src allows inline *attributes* because the UI sets a few dynamic
# values that cannot be classes (the heatmap's --hm-cell size, and Motion's
# transform/opacity). No user text is ever injected as HTML or CSS.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; font-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    ),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import models so their tables are registered before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# Starlette runs the *last* added middleware outermost.
app.middleware("http")(origin_check_middleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=settings.cookie_secure,
)

app.include_router(auth.router)
app.include_router(logs.router)
app.include_router(llm.router)
app.include_router(stats.router)

if ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak a stack trace (or anything from request headers) to the client.
    # The security-headers middleware sits inside this handler, so set them here.
    return JSONResponse(
        {"detail": "Internal server error"},
        status_code=500,
        headers=_SECURITY_HEADERS,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


def _index_response() -> FileResponse:
    if not INDEX_FILE.is_file():
        raise HTTPException(
            status_code=503,
            detail="Frontend not built. Run `npm --prefix web run build`.",
        )
    return FileResponse(INDEX_FILE)


@app.get("/")
def index() -> FileResponse:
    return _index_response()


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str) -> FileResponse:
    """Serve real files from web/dist; hand unknown non-API routes to index.html."""
    if full_path.startswith(API_PREFIXES):
        raise HTTPException(status_code=404, detail="Not found")

    candidate = (DIST_DIR / full_path).resolve()
    if DIST_DIR.resolve() in candidate.parents and candidate.is_file():
        return FileResponse(candidate)
    # A missing file with an extension (favicon.ico, *.js, *.css) is a real 404.
    if "." in Path(full_path).name:
        raise HTTPException(status_code=404, detail="Not found")
    return _index_response()
