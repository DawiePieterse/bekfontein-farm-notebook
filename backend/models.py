from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    recorder = "recorder"
    viewer = "viewer"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    password_hash: str
    role: UserRole
    display_name: str = ""


class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)


class EntryTagLink(SQLModel, table=True):
    entry_id: str = Field(foreign_key="entry.id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", primary_key=True)


class Entry(SQLModel, table=True):
    """id is a client-generated UUID, not autoincrement - this is what makes
    offline sync safe to retry (idempotent upsert by id), matching the
    harvest app's HarvestRecord.uuid pattern."""
    id: str = Field(primary_key=True)
    title: str = ""
    body: str = ""
    block: str = ""  # free text, e.g. "Block 4 North" - deliberately not an
    # FK into the harvest app's Block table; the two apps are independent,
    # this is just a naming convention for cross-reference.
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime
    updated_at: Optional[datetime] = None
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    archived: bool = False  # soft delete - mirrors Worker.active/Block.active.
    # A fat-fingered delete on hard-won farm knowledge must be recoverable.


class Photo(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    entry_id: str = Field(foreign_key="entry.id")
    filename: str
    uploaded_at: datetime
    caption: str = ""
