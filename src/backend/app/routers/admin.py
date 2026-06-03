from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import AuditLog, ConfigItem, ROLE_ADMIN, ROLE_MANAGER, User
from app.schemas import ConfigUpdateRequest
from app.services import ensure_admin, serialize_audit, serialize_user, utcnow, write_audit

router = APIRouter()


@router.get("/admin/users")
def list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        return {"items": [serialize_user(current_user)]}
    users = session.exec(select(User).order_by(User.created_at.asc())).all()
    return {"items": [serialize_user(user) for user in users]}


@router.get("/admin/roles")
def list_roles(current_user: User = Depends(get_current_user)):
    ensure_admin(current_user)
    return {
        "items": [
            {"code": "sales", "label": "销售"},
            {"code": "manager", "label": "销售经理"},
            {"code": "admin", "label": "系统管理员"},
        ]
    }


@router.get("/admin/config")
def list_config(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    items = session.exec(select(ConfigItem).order_by(ConfigItem.key.asc())).all()
    return {"items": [{"id": item.id, "key": item.key, "value": item.value, "updated_at": item.updated_at} for item in items]}


@router.put("/admin/config/{item_id}")
def update_config(
    item_id: int,
    body: ConfigUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    item = session.get(ConfigItem, item_id)
    if not item:
        return {"detail": "配置项不存在"}
    item.value = body.value
    item.updated_at = utcnow()
    session.add(item)
    write_audit(session, current_user, "更新系统配置", "配置", str(item.id), details=item.key)
    session.commit()
    session.refresh(item)
    return {"id": item.id, "key": item.key, "value": item.value, "updated_at": item.updated_at}


@router.get("/admin/logs")
def list_logs(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = session.exec(select(AuditLog).order_by(AuditLog.created_at.desc())).all()
    return {"items": [serialize_audit(item) for item in logs]}

