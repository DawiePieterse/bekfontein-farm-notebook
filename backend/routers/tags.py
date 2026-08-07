from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from db import get_session
from models import EntryTagLink, Tag, User
from security import get_current_user

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """All known tags with how many (non-archived) entries use each - for
    autocomplete while typing and the filter chip list."""
    tags = session.exec(select(Tag)).all()
    result = []
    for t in tags:
        count = len(session.exec(select(EntryTagLink).where(EntryTagLink.tag_id == t.id)).all())
        result.append({"name": t.name, "count": count})
    result.sort(key=lambda r: r["name"].lower())
    return result
