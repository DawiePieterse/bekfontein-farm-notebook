from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, SQLModel, select

from db import get_session, pwd_context
from models import User
from security import create_access_token, get_current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ChangePasswordIn(SQLModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form.username)).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    return {
        "access_token": create_access_token(user.username),
        "token_type": "bearer",
        "role": user.role,
        "display_name": user.display_name,
    }


@router.post("/change-password")
def change_password(payload: ChangePasswordIn, session: Session = Depends(get_session),
                     current: User = Depends(get_current_user)):
    if not verify_password(payload.current_password, current.password_hash):
        # 400, not 401: the caller IS authenticated, they just mistyped the
        # old password. The apps treat a 401 as "this session is dead, sign in
        # again", so returning one here would throw the user out to the login
        # screen over a typo.
        raise HTTPException(400, "Current password is incorrect")
    current.password_hash = pwd_context.hash(payload.new_password)
    session.add(current)
    session.commit()
    return {"ok": True}
