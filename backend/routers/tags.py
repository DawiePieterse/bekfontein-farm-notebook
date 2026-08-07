from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db import get_session
from models import EntryTagLink, Tag, User
from security import get_current_user, require_recorder

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


@router.delete("/{name}")
def delete_tag(name: str, session: Session = Depends(get_session), user: User = Depends(require_recorder)):
    """Delete a tag outright - only allowed while it's attached to zero
    entries, so this can never silently detach a tag from something Andre
    is still using it on. Renaming/merging tags is not supported."""
    tag = session.exec(select(Tag).where(Tag.name == name)).first()
    if not tag:
        raise HTTPException(404, "Tag not found")
    count = len(session.exec(select(EntryTagLink).where(EntryTagLink.tag_id == tag.id)).all())
    if count > 0:
        raise HTTPException(400, "Tag is still used by entries")
    session.delete(tag)
    session.commit()
    return {"ok": True}
