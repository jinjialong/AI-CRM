from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.models import User
from app.schemas import LoginRequest
from app.services import serialize_user

router = APIRouter()


@router.post("/auth/login")
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.login == body.login)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    token = create_access_token(user.login, {"role": user.role})
    return {"access_token": token, "user": serialize_user(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return serialize_user(user)

