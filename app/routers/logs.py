"""Log endpoints. Every query is scoped to the current user."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Log, User
from ..schemas import LogCreate, LogOut, LogResult, LogUpdate
from ..security import get_current_user
from ..services.llm import LLMCreds, CleanResult, clean_log
from ..services.llm_usage import server_key_usage
from ..timeutils import local_today
from .llm import byok_creds

router = APIRouter(prefix="/logs", tags=["logs"])

MAX_LIMIT = 100
CAP_NOTICE = (
    "Daily limit for the shared AI key reached. "
    "Add your own key in Settings to keep using AI."
)


def _own_log(db: Session, user: User, log_id: int) -> Log:
    log = db.scalar(select(Log).where(Log.id == log_id, Log.user_id == user.id))
    if log is None:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _apply_clean(log: Log, result) -> None:
    log.bullets = result.bullets
    log.tweet_text = result.tweet
    log.item_count = len(result.bullets)


def _run_clean(
    raw_text: str,
    day_number: int,
    user: User,
    creds: LLMCreds | None,
) -> tuple[CleanResult, str | None]:
    """Clean a log, applying the daily cap on server-key calls."""
    using_user_key = creds is not None and bool(creds.api_key)
    allow_server = True
    notice = None
    if not using_user_key and settings.llm_api_key:
        if not server_key_usage.consume(user.id, local_today()):
            allow_server = False
            notice = CAP_NOTICE
    result = clean_log(raw_text, day_number, creds, allow_server=allow_server)
    return result, notice


@router.post("", response_model=LogResult, status_code=201)
def create_log(
    payload: LogCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    creds: LLMCreds | None = Depends(byok_creds),
) -> LogResult:
    today = local_today()
    log_date = payload.date or today
    if log_date > today:
        raise HTTPException(status_code=422, detail="Date cannot be in the future")
    if log_date < user.start_date:
        raise HTTPException(status_code=422, detail="Date is before your start date")

    existing = db.scalar(
        select(Log).where(Log.user_id == user.id, Log.date == log_date)
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={"message": "You already logged this day", "log_id": existing.id},
        )

    day_number = (log_date - user.start_date).days + 1
    result, notice = _run_clean(payload.raw_text, day_number, user, creds)
    log = Log(
        user_id=user.id,
        date=log_date,
        day_number=day_number,
        raw_text=payload.raw_text,
    )
    _apply_clean(log, result)
    db.add(log)
    db.commit()
    db.refresh(log)
    return LogResult(log=LogOut.model_validate(log), used=result.used, notice=notice)


@router.post("/{log_id}/regenerate", response_model=LogResult)
def regenerate(
    log_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    creds: LLMCreds | None = Depends(byok_creds),
) -> LogResult:
    log = _own_log(db, user, log_id)
    result, notice = _run_clean(log.raw_text, log.day_number, user, creds)
    _apply_clean(log, result)
    db.commit()
    db.refresh(log)
    return LogResult(log=LogOut.model_validate(log), used=result.used, notice=notice)


@router.put("/{log_id}", response_model=LogOut)
def update_log(
    log_id: int,
    payload: LogUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Log:
    log = _own_log(db, user, log_id)
    if payload.bullets is not None:
        log.bullets = [b.strip() for b in payload.bullets if b.strip()]
        log.item_count = len(log.bullets)
    if payload.tweet_text is not None:
        log.tweet_text = payload.tweet_text
    db.commit()
    db.refresh(log)
    return log


@router.get("/day/{day_number}", response_model=LogOut)
def get_by_day(
    day_number: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Log:
    log = db.scalar(
        select(Log).where(Log.user_id == user.id, Log.day_number == day_number)
    )
    if log is None:
        raise HTTPException(status_code=404, detail="No log for that day")
    return log


@router.get("", response_model=list[LogOut])
def list_logs(
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Log]:
    stmt = select(Log).where(Log.user_id == user.id)
    if q:
        pattern = f"%{_escape_like(q)}%"
        stmt = stmt.where(
            or_(
                Log.raw_text.ilike(pattern, escape="\\"),
                cast(Log.bullets, String).ilike(pattern, escape="\\"),
            )
        )
    stmt = stmt.order_by(Log.date.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all())
