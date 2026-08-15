import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from db import DATA_DIR, engine, pwd_context
from models import User, UserRole


def _load_or_create_secret_key() -> str:
    """The key that signs login tokens, kept in the data directory so it
    survives a restart.

    It used to be os.urandom() on every import, which meant a brand new key
    each time the process started - and the farm PC starts the server at boot.
    Every reboot therefore invalidated both accounts' 30-day tokens at once.
    The apps didn't show that as a login problem either: every request just
    began failing with 401, which the screens read as "no connection", so the
    Dashboard sat empty, entries fell back to the local copy, and sync retried
    forever while the header still said "Signed in as Andre".

    NOTEBOOK_SECRET_KEY still wins if it is set, for a deployment that would
    rather manage the secret itself.
    """
    from_env = os.environ.get("NOTEBOOK_SECRET_KEY")
    if from_env:
        return from_env
    key_path = os.path.join(DATA_DIR, "secret_key")
    try:
        with open(key_path) as f:
            existing = f.read().strip()
        if existing:
            return existing
    except FileNotFoundError:
        pass
    key = os.urandom(32).hex()
    # Written 0600 so the key isn't readable by other accounts on the machine.
    # backup.py only ever zips the DB and photos, so it stays out of backups.
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key)
    return key


SECRET_KEY = _load_or_create_secret_key()
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

bearer_scheme = HTTPBearer(auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        # An unreadable stored hash (hand-edited row, half-finished restore)
        # otherwise escapes as a 500 with a stack trace on the login screen.
        # It isn't a valid password either way, so answer it like any other
        # wrong one and let the normal "Invalid username or password" show.
        return False


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


def require_recorder(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.recorder:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the recorder account can do this")
    return user
