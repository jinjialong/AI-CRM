from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.ai_monitor import (
    audit_action_detail,
    audit_action_item,
    audit_actions_for_object,
    audit_summary,
    default_monitor_start_date,
    paginate,
    query_run_logs,
    token_capability_distribution,
    token_case_item,
    token_fallback_breakdown,
    token_processing_modes,
    token_route_sources,
    token_session_detail,
    token_summary,
    token_top_cost,
    token_trend,
)
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
        raise HTTPException(status_code=404, detail="配置项不存在")
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


@router.get("/admin/ai-monitor/token/summary")
def ai_monitor_token_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_summary(logs)


@router.get("/admin/ai-monitor/token/trend")
def ai_monitor_token_trend(
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: str = "day",
    capability: str = "",
    model: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
    )
    return token_trend(logs, bucket=bucket)


@router.get("/admin/ai-monitor/token/route-sources")
def ai_monitor_token_route_sources(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_route_sources(logs)


@router.get("/admin/ai-monitor/token/fallback-breakdown")
def ai_monitor_token_fallback_breakdown(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_fallback_breakdown(logs)


@router.get("/admin/ai-monitor/token/processing-modes")
def ai_monitor_token_processing_modes(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_processing_modes(logs)


@router.get("/admin/ai-monitor/token/capability-distribution")
def ai_monitor_token_capability_distribution(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_capability_distribution(logs)


@router.get("/admin/ai-monitor/token/top-cost")
def ai_monitor_token_top_cost(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
    )
    return token_top_cost(logs)


@router.get("/admin/ai-monitor/token/cases")
def ai_monitor_token_cases(
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    search: str = "",
    bucket_label: str = "",
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        model=model,
        result_kind=result_kind,
        fallback_used=fallback_used,
        search=search,
    )
    if bucket_label:
        logs = [item for item in logs if item.created_at.strftime("%m-%d") == bucket_label or item.created_at.strftime("%m-%d %H:00") == bucket_label]
    return {"items": [token_case_item(item) for item in paginate(logs, page, page_size)], "total": len(logs)}


@router.get("/admin/ai-monitor/token/sessions/{session_id}")
def ai_monitor_token_session_detail(
    session_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    return token_session_detail(session, session_id)


@router.get("/admin/ai-monitor/audit/summary")
def ai_monitor_audit_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str = "",
    capability: str = "",
    action_type: str = "",
    risk_level: str = "",
    result: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        action_type=action_type,
        risk_level=risk_level,
        result=result,
    )
    if user_id:
        logs = [item for item in logs if str(item.user_id) == user_id]
    return audit_summary(logs)


@router.get("/admin/ai-monitor/audit/actions")
def ai_monitor_audit_actions(
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str = "",
    capability: str = "",
    action_type: str = "",
    risk_level: str = "",
    result: str = "",
    search: str = "",
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = query_run_logs(
        session,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
        capability=capability,
        action_type=action_type,
        risk_level=risk_level,
        result=result,
        search=search,
    )
    if user_id:
        logs = [item for item in logs if str(item.user_id) == user_id]
    return {"items": [audit_action_item(item) for item in paginate(logs, page, page_size)], "total": len(logs)}


@router.get("/admin/ai-monitor/audit/actions/{action_id}")
def ai_monitor_audit_action_detail(
    action_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    detail = audit_action_detail(session, action_id)
    if not detail:
        raise HTTPException(status_code=404, detail="AI 审计动作不存在")
    return detail


@router.get("/admin/ai-monitor/audit/object-actions")
def ai_monitor_audit_object_actions(
    object_type: str,
    object_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    logs = audit_actions_for_object(
        session,
        object_type=object_type,
        object_id=object_id,
        date_from=date_from or default_monitor_start_date(),
        date_to=date_to or utcnow().date(),
    )
    return {"items": [audit_action_item(item) for item in paginate(logs, page, page_size)], "total": len(logs)}
