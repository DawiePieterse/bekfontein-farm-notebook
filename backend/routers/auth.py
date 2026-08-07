from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from db import get_session, pwd_context
from models import User
from security import create_access_token, get_current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
def change_password(new_password: str, session: Session = Depends(get_session),
                     current: User = Depends(get_current_user)):
    current.password_hash = pwd_context.hash(new_password)
    session.add(current)
    session.commit()
    return {"ok": True}
