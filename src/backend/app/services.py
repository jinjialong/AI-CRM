import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
import httpx
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.models import (
    AuditLog,
    CommunicationNote,
    ConfigItem,
    Contact,
    Customer,
    CustomerFollowUp,
    LEGACY_LEAD_STATUS_CONVERTED,
    LEGACY_LEAD_STATUS_INVALID,
    LeadContact,
    LEAD_STATUS_FOLLOWING,
    LEAD_STATUS_DROPPED,
    LEAD_STATUS_HIGH_PROBABILITY,
    LEAD_STATUS_HIGH_RISK,
    LEAD_STATUS_MUST_WIN,
    Lead,
    LeadAnalysisCurrent,
    LeadAnalysisSnapshot,
    LeadConversation,
    LeadFollowUp,
    LeadKeyEvent,
    Opportunity,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_SALES,
    User,
    VisitRecord,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_manager_or_admin(user: User) -> bool:
    return user.role in {ROLE_MANAGER, ROLE_ADMIN}


def is_dropped_lead(lead: Lead) -> bool:
    return lead.status in {LEAD_STATUS_DROPPED, LEGACY_LEAD_STATUS_INVALID}


def is_converted_lead(lead: Lead) -> bool:
    return lead.converted_customer_id is not None or lead.status == LEGACY_LEAD_STATUS_CONVERTED


def ensure_admin(user: User) -> None:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有系统管理员可以访问")


def ensure_lead_access(user: User, lead: Lead) -> None:
    if is_manager_or_admin(user):
        return
    if lead.owner_id == user.id:
        return
    if lead.owner_id is None and lead.created_by_id == user.id:
        return
    if lead.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该线索")


def ensure_customer_access(user: User, customer: Customer) -> None:
    if is_manager_or_admin(user):
        return
    if customer.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该客户")


def get_user_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


def get_lead_or_404(session: Session, lead_id: int) -> Lead:
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线索不存在")
    return lead


def get_customer_or_404(session: Session, customer_id: int) -> Customer:
    customer = session.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="客户不存在")
    return customer


def get_config_values(session: Session) -> dict[str, str]:
    items = session.exec(select(ConfigItem)).all()
    return {item.key: item.value for item in items}


def split_config_value(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def write_audit(
    session: Session,
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    result: str = "成功",
    source: str = "页面",
    details: str = "",
) -> None:
    session.add(
        AuditLog(
            actor_id=actor.id,
            actor_name=actor.name,
            actor_role=actor.role,
            action=action,
            target_type=target_type,
            target_id=target_id,
            result=result,
            source=source,
            details=details,
        )
    )


def update_model(instance: Any, payload: dict[str, Any]) -> None:
    for key, value in payload.items():
        if value is not None and hasattr(instance, key):
            setattr(instance, key, value)


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "login": user.login,
        "name": user.name,
        "roles": [user.role],
        "role": user.role,
        "manager_id": user.manager_id,
    }


def get_lead_contacts(session: Session, lead_id: int) -> list[LeadContact]:
    return session.exec(
        select(LeadContact)
        .where(LeadContact.lead_id == lead_id)
        .order_by(LeadContact.is_primary.desc(), LeadContact.created_at.asc())
    ).all()


def get_primary_lead_contact(session: Session, lead_id: int) -> LeadContact | None:
    contacts = get_lead_contacts(session, lead_id)
    return contacts[0] if contacts else None


def serialize_lead_contact(contact: LeadContact) -> dict[str, Any]:
    return {
        "id": contact.id,
        "lead_id": contact.lead_id,
        "name": contact.name,
        "job_title": contact.job_title,
        "phone": contact.phone,
        "wechat": contact.wechat,
        "is_primary": contact.is_primary,
        "created_at": contact.created_at,
    }


def serialize_lead(session: Session, lead: Lead) -> dict[str, Any]:
    owner_name = None
    if lead.owner_id:
        owner = session.get(User, lead.owner_id)
        owner_name = owner.name if owner else None
    contacts = get_lead_contacts(session, lead.id)
    primary_contact = contacts[0] if contacts else None
    return {
        "id": lead.id,
        "company_name": lead.company_name,
        "organization_code": lead.organization_code,
        "region": lead.region,
        "source": lead.source,
        "owner_id": lead.owner_id,
        "owner_name": owner_name,
        "status": lead.status,
        "is_converted": is_converted_lead(lead),
        "is_public": lead.is_public,
        "notes": lead.notes,
        "converted_customer_id": lead.converted_customer_id,
        "primary_contact_name": primary_contact.name if primary_contact else "",
        "primary_contact_phone": primary_contact.phone if primary_contact else "",
        "primary_contact_job_title": primary_contact.job_title if primary_contact else "",
        "contacts": [serialize_lead_contact(item) for item in contacts],
        "contact_count": len(contacts),
        "created_at": lead.created_at,
        "updated_at": lead.updated_at,
    }


def serialize_customer(session: Session, customer: Customer) -> dict[str, Any]:
    owner = session.get(User, customer.owner_id)
    return {
        "id": customer.id,
        "customer_name": customer.customer_name,
        "source_lead_id": customer.source_lead_id,
        "contact_name": customer.contact_name,
        "phone": customer.phone,
        "company_name": customer.company_name,
        "owner_id": customer.owner_id,
        "owner_name": owner.name if owner else None,
        "notes": customer.notes,
        "created_at": customer.created_at,
        "updated_at": customer.updated_at,
    }


def serialize_lead_followup(session: Session, followup: LeadFollowUp) -> dict[str, Any]:
    actor = session.get(User, followup.created_by_id)
    return {
        "id": followup.id,
        "lead_id": followup.lead_id,
        "method": followup.method,
        "content": followup.content,
        "follow_up_time": followup.follow_up_time,
        "next_follow_up_time": followup.next_follow_up_time,
        "created_by_id": followup.created_by_id,
        "created_by_name": actor.name if actor else None,
        "created_at": followup.created_at,
    }


def serialize_customer_followup(session: Session, followup: CustomerFollowUp) -> dict[str, Any]:
    actor = session.get(User, followup.created_by_id)
    return {
        "id": followup.id,
        "customer_id": followup.customer_id,
        "opportunity_id": followup.opportunity_id,
        "method": followup.method,
        "content": followup.content,
        "follow_up_time": followup.follow_up_time,
        "next_follow_up_time": followup.next_follow_up_time,
        "created_by_id": followup.created_by_id,
        "created_by_name": actor.name if actor else None,
        "created_at": followup.created_at,
    }


def serialize_contact(contact: Contact) -> dict[str, Any]:
    return {
        "id": contact.id,
        "customer_id": contact.customer_id,
        "name": contact.name,
        "phone": contact.phone,
        "job_title": contact.job_title,
        "wechat": contact.wechat,
        "email": contact.email,
        "is_primary": contact.is_primary,
        "notes": contact.notes,
        "created_at": contact.created_at,
    }


def serialize_visit(visit: VisitRecord) -> dict[str, Any]:
    return {
        "id": visit.id,
        "customer_id": visit.customer_id,
        "opportunity_id": visit.opportunity_id,
        "visit_time": visit.visit_time,
        "visit_method": visit.visit_method,
        "participants": visit.participants,
        "content": visit.content,
        "conclusion": visit.conclusion,
        "next_plan": visit.next_plan,
        "created_at": visit.created_at,
    }


def serialize_note(note: CommunicationNote) -> dict[str, Any]:
    return {
        "id": note.id,
        "customer_id": note.customer_id,
        "opportunity_id": note.opportunity_id,
        "communication_time": note.communication_time,
        "method": note.method,
        "counterpart": note.counterpart,
        "content": note.content,
        "todo_items": note.todo_items,
        "created_at": note.created_at,
    }


def serialize_opportunity(session: Session, opportunity: Opportunity) -> dict[str, Any]:
    owner = session.get(User, opportunity.owner_id)
    return {
        "id": opportunity.id,
        "customer_id": opportunity.customer_id,
        "source_lead_id": opportunity.source_lead_id,
        "name": opportunity.name,
        "amount": opportunity.amount,
        "stage": opportunity.stage,
        "status": opportunity.status,
        "expected_close_date": opportunity.expected_close_date,
        "owner_id": opportunity.owner_id,
        "owner_name": owner.name if owner else None,
        "notes": opportunity.notes,
        "created_at": opportunity.created_at,
        "updated_at": opportunity.updated_at,
    }


def get_opportunity_or_404(session: Session, opportunity_id: int) -> Opportunity:
    item = session.get(Opportunity, opportunity_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商机不存在")
    return item


def serialize_audit(log: AuditLog) -> dict[str, Any]:
    return {
        "id": log.id,
        "actor_name": log.actor_name,
        "actor_role": log.actor_role,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "result": log.result,
        "source": log.source,
        "details": log.details,
        "created_at": log.created_at,
    }


def serialize_lead_conversation(session: Session, conversation: LeadConversation) -> dict[str, Any]:
    actor = session.get(User, conversation.created_by_id)
    return {
        "id": conversation.id,
        "lead_id": conversation.lead_id,
        "source_type": conversation.source_type,
        "content": conversation.content,
        "conversation_time": conversation.conversation_time,
        "created_by_id": conversation.created_by_id,
        "created_by_name": actor.name if actor else None,
        "created_at": conversation.created_at,
    }


def serialize_lead_key_event(session: Session, item: LeadKeyEvent) -> dict[str, Any]:
    actor = session.get(User, item.created_by_id)
    return {
        "id": item.id,
        "lead_id": item.lead_id,
        "event_type": item.event_type,
        "event_time": item.event_time,
        "note": item.note,
        "created_by_id": item.created_by_id,
        "created_by_name": actor.name if actor else None,
        "created_at": item.created_at,
    }


def _build_dimension(code: str, label: str, evidences: list[str]) -> dict[str, Any]:
    cleaned = [item.strip() for item in evidences if item and item.strip()]
    return {
        "code": code,
        "label": label,
        "matched": bool(cleaned),
        "evidence_count": len(cleaned),
        "evidences": cleaned[:3],
    }


def _format_dimension_label(dimension_map: dict[str, dict[str, Any]], code: str) -> str:
    item = dimension_map.get(code)
    return item["label"] if item else code


def _build_trigger_label(trigger: dict[str, Any] | None) -> str:
    if not trigger:
        return "自动分析"
    return str(trigger.get("label") or "自动分析")


def _build_reason_summary(
    trigger_label: str,
    score_delta: int,
    added_dimensions: list[str],
    removed_dimensions: list[str],
    stale_penalty: int,
) -> str:
    changes: list[str] = []
    if added_dimensions:
        changes.append(f"补充了 {', '.join(added_dimensions)}")
    if removed_dimensions:
        changes.append(f"丢失了 {', '.join(removed_dimensions)}")
    if stale_penalty < 0:
        changes.append("存在时效衰减")
    if not changes:
        changes.append("关键维度未发生变化")
    if score_delta > 0:
        return f"{trigger_label}后，{ '，'.join(changes) }，分数上升 {score_delta} 分。"
    if score_delta < 0:
        return f"{trigger_label}后，{ '，'.join(changes) }，分数下降 {abs(score_delta)} 分。"
    return f"{trigger_label}后，{ '，'.join(changes) }，分数保持不变。"


def _collect_analysis_evidences(
    lead: Lead,
    contacts: list[LeadContact],
    followups: list[LeadFollowUp],
    conversations: list[LeadConversation],
    key_events: list[LeadKeyEvent],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if lead.notes.strip():
        items.append({"text": lead.notes.strip(), "source": "lead_note"})
    for contact in contacts:
        text = " ".join(filter(None, [contact.name, contact.job_title, contact.phone]))
        if text.strip():
            items.append({"text": text.strip(), "source": "lead_contact"})
    for followup in followups:
        if followup.content.strip():
            items.append({"text": followup.content.strip(), "source": "lead_followup"})
    for conversation in conversations:
        if conversation.content.strip():
            items.append({"text": conversation.content.strip(), "source": "lead_conversation"})
    for event in key_events:
        items.append({"text": f"{event.event_type} {event.note}".strip(), "source": "lead_key_event"})
    return items


def build_lead_analysis_payload(
    lead: Lead,
    contacts: list[LeadContact],
    followups: list[LeadFollowUp],
    conversations: list[LeadConversation],
    key_events: list[LeadKeyEvent],
    previous_snapshot: LeadAnalysisSnapshot | None = None,
    trigger: dict[str, Any] | None = None,
) -> dict[str, Any]:
    evidences = _collect_analysis_evidences(lead, contacts, followups, conversations, key_events)
    texts = [item["text"] for item in evidences]

    def pick(*keywords: str) -> list[str]:
        return [text for text in texts if any(keyword in text for keyword in keywords)]

    dimensions = [
        _build_dimension("metrics", "量化目标", pick("指标", "数字", "提升", "ROI", "转化", "营收", "效率")),
        _build_dimension("economic_buyer", "拍板人", pick("老板", "总经理", "CFO", "CEO", "拍板", "审批")),
        _build_dimension("decision_criteria", "决策标准", pick("标准", "预算", "价格", "案例", "效果", "对比")),
        _build_dimension("decision_process", "决策流程", pick("流程", "审批", "采购", "立项", "下周demo", "demo")),
        _build_dimension("implicate_pain", "核心痛点", pick("痛点", "问题", "卡点", "困难", "风险")),
        _build_dimension("champion", "内部支持者", pick("支持", "Champion", "CIO", "内部推动", "帮忙推进")),
        _build_dimension("competition", "竞争情况", pick("竞品", "竞争", "对比", "其他供应商", "自研")),
    ]

    now = utcnow()
    completed_dimension_count = sum(1 for item in dimensions if item["matched"])
    dimension_score = completed_dimension_count * 10
    activity_score = 0
    if followups:
        activity_score += 4
    if conversations:
        activity_score += 4
    if len(followups) + len(conversations) + len(key_events) >= 2:
        activity_score += 4
    if any(item.next_follow_up_time for item in followups):
        activity_score += 3
    activity_score = min(activity_score, 15)

    milestone_score = 0
    positive_event_keywords = ("demo", "报价", "立项", "采购", "审批", "拍板", "合同")
    positive_event_count = len(
        [
            item
            for item in key_events
            if any(keyword in f"{item.event_type} {item.note}".lower() for keyword in positive_event_keywords)
        ]
    )
    if lead.status == LEAD_STATUS_HIGH_PROBABILITY:
        milestone_score += 4
    if lead.status == LEAD_STATUS_MUST_WIN:
        milestone_score += 8
    if positive_event_count:
        milestone_score += min(positive_event_count * 4, 8)
    milestone_score = min(milestone_score, 15)

    latest_activity_candidates = [
        _normalize_datetime(lead.updated_at),
        *(_normalize_datetime(item.follow_up_time) for item in followups),
        *(_normalize_datetime(item.conversation_time) for item in conversations),
        *(_normalize_datetime(item.event_time) for item in key_events),
    ]
    latest_activity_candidates = [item for item in latest_activity_candidates if item is not None]
    latest_activity_at = max(latest_activity_candidates) if latest_activity_candidates else now
    inactive_days = max((now - latest_activity_at).days, 0)
    stale_penalty = 0
    if inactive_days >= 30:
        stale_penalty = -15
    elif inactive_days >= 14:
        stale_penalty = -10
    elif inactive_days >= 7:
        stale_penalty = -5
    if lead.status == LEAD_STATUS_HIGH_RISK:
        stale_penalty -= 5
    if lead.status == LEAD_STATUS_DROPPED:
        stale_penalty -= 20

    score = max(min(dimension_score + activity_score + milestone_score + stale_penalty, 100), 0)

    missing_labels = [item["label"] for item in dimensions if not item["matched"]]
    next_best_action = (
        f"优先补充：{missing_labels[0]}。"
        if missing_labels
        else "关键信息已较完整，建议推动下一步成交动作。"
    )
    summary = (
        f"当前已确认 {completed_dimension_count}/7 个关键维度。"
        if completed_dimension_count
        else "当前缺少足够的销售分析材料。"
    )

    previous_payload = json.loads(previous_snapshot.snapshot_payload or "{}") if previous_snapshot else {}
    previous_dimensions = {
        item.get("code"): item
        for item in previous_payload.get("dimensions", [])
        if isinstance(item, dict) and item.get("code")
    }
    current_dimensions = {item["code"]: item for item in dimensions}
    added_dimension_codes = [
        code for code, item in current_dimensions.items() if item["matched"] and not previous_dimensions.get(code, {}).get("matched")
    ]
    removed_dimension_codes = [
        code for code, item in previous_dimensions.items() if item.get("matched") and not current_dimensions.get(code, {}).get("matched")
    ]
    score_delta = score - (previous_snapshot.score if previous_snapshot else 0)
    completed_delta = completed_dimension_count - (
        previous_snapshot.completed_dimension_count if previous_snapshot else 0
    )
    trigger_label = _build_trigger_label(trigger)
    added_dimension_labels = [_format_dimension_label(current_dimensions, code) for code in added_dimension_codes]
    removed_dimension_labels = [_format_dimension_label(previous_dimensions, code) for code in removed_dimension_codes]
    reason_summary = _build_reason_summary(
        trigger_label,
        score_delta,
        added_dimension_labels,
        removed_dimension_labels,
        stale_penalty,
    )

    payload = {
        "dimensions": dimensions,
        "summary": summary,
        "source_counts": {
            "followups": len(followups),
            "conversations": len(conversations),
            "key_events": len(key_events),
        },
        "trigger": trigger or {"type": "auto", "label": trigger_label},
        "delta": {
            "score": score_delta,
            "completed_dimension_count": completed_delta,
        },
        "changes": {
            "added_dimensions": added_dimension_codes,
            "removed_dimensions": removed_dimension_codes,
        },
        "reason_codes": [
            *(f"dimension_added.{code}" for code in added_dimension_codes),
            *(f"dimension_removed.{code}" for code in removed_dimension_codes),
            "stale_penalty" if stale_penalty < 0 else None,
        ],
        "reason_summary": reason_summary,
        "score_breakdown": {
            "dimension_score": dimension_score,
            "activity_score": activity_score,
            "milestone_score": milestone_score,
            "risk_adjustment": stale_penalty,
        },
        "latest_activity_at": latest_activity_at.isoformat(),
        "inactive_days": inactive_days,
    }
    return {
        "score": score,
        "completed_dimension_count": completed_dimension_count,
        "total_dimension_count": len(dimensions),
        "dimension_payload": payload,
        "next_best_action": next_best_action,
        "analysis_version": "v1-rule",
        "raw_payload": {
            "lead_id": lead.id,
            "evidence_count": len(evidences),
            "trigger": trigger or {"type": "auto", "label": trigger_label},
        },
    }


def save_lead_analysis_current(session: Session, lead_id: int, analysis: dict[str, Any]) -> LeadAnalysisCurrent:
    current = session.exec(select(LeadAnalysisCurrent).where(LeadAnalysisCurrent.lead_id == lead_id)).first()
    if not current:
        current = LeadAnalysisCurrent(lead_id=lead_id)
    current.score = analysis["score"]
    current.completed_dimension_count = analysis["completed_dimension_count"]
    current.total_dimension_count = analysis["total_dimension_count"]
    current.dimension_payload = json.dumps(analysis["dimension_payload"], ensure_ascii=False)
    current.next_best_action = analysis["next_best_action"]
    current.analysis_version = analysis["analysis_version"]
    current.raw_payload = json.dumps(analysis["raw_payload"], ensure_ascii=False)
    current.analyzed_at = utcnow()
    current.updated_at = utcnow()
    session.add(current)
    session.flush()
    return current


def append_lead_analysis_snapshot(session: Session, lead_id: int, analysis: dict[str, Any]) -> LeadAnalysisSnapshot:
    latest_snapshot = session.exec(
        select(LeadAnalysisSnapshot)
        .where(LeadAnalysisSnapshot.lead_id == lead_id)
        .order_by(LeadAnalysisSnapshot.analyzed_at.desc())
    ).first()
    latest_payload = json.loads(latest_snapshot.snapshot_payload or "{}") if latest_snapshot else {}
    current_payload = analysis["dimension_payload"]
    score_changed = not latest_snapshot or latest_snapshot.score != analysis["score"]
    completion_changed = (
        not latest_snapshot
        or latest_snapshot.completed_dimension_count != analysis["completed_dimension_count"]
        or latest_snapshot.total_dimension_count != analysis["total_dimension_count"]
    )
    changes_changed = (
        latest_payload.get("changes", {}).get("added_dimensions", []) != current_payload.get("changes", {}).get("added_dimensions", [])
        or latest_payload.get("changes", {}).get("removed_dimensions", []) != current_payload.get("changes", {}).get("removed_dimensions", [])
    )
    trigger_type = current_payload.get("trigger", {}).get("type")
    important_trigger = trigger_type in {"key_event_created", "status_changed", "lead_marked_lost", "manual_rebuild"}
    if latest_snapshot and not score_changed and not completion_changed and not changes_changed and not important_trigger:
        return latest_snapshot
    snapshot = LeadAnalysisSnapshot(
        lead_id=lead_id,
        score=analysis["score"],
        completed_dimension_count=analysis["completed_dimension_count"],
        total_dimension_count=analysis["total_dimension_count"],
        snapshot_payload=json.dumps(analysis["dimension_payload"], ensure_ascii=False),
        analyzed_at=utcnow(),
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def serialize_lead_analysis_current(current: LeadAnalysisCurrent | None) -> dict[str, Any] | None:
    if not current:
        return None
    payload = json.loads(current.dimension_payload or "{}")
    return {
        "score": current.score,
        "completed_dimension_count": current.completed_dimension_count,
        "total_dimension_count": current.total_dimension_count,
        "next_best_action": current.next_best_action,
        "analysis_version": current.analysis_version,
        "analyzed_at": current.analyzed_at,
        "dimensions": payload.get("dimensions", []),
        "summary": payload.get("summary", ""),
        "source_counts": payload.get("source_counts", {}),
    }


def serialize_lead_analysis_snapshot(snapshot: LeadAnalysisSnapshot) -> dict[str, Any]:
    payload = json.loads(snapshot.snapshot_payload or "{}")
    trigger = payload.get("trigger", {})
    delta = payload.get("delta", {})
    changes = payload.get("changes", {})
    return {
        "id": snapshot.id,
        "lead_id": snapshot.lead_id,
        "score": snapshot.score,
        "completed_dimension_count": snapshot.completed_dimension_count,
        "total_dimension_count": snapshot.total_dimension_count,
        "analyzed_at": snapshot.analyzed_at,
        "trigger_type": trigger.get("type"),
        "trigger_label": trigger.get("label"),
        "score_delta": delta.get("score", 0),
        "reason_summary": payload.get("reason_summary", ""),
        "added_dimensions": changes.get("added_dimensions", []),
        "removed_dimensions": changes.get("removed_dimensions", []),
        "source_counts": payload.get("source_counts", {}),
    }


def rebuild_lead_analysis(session: Session, lead: Lead, trigger: dict[str, Any] | None = None) -> dict[str, Any]:
    contacts = get_lead_contacts(session, lead.id)
    followups = session.exec(
        select(LeadFollowUp).where(LeadFollowUp.lead_id == lead.id).order_by(LeadFollowUp.created_at.desc())
    ).all()
    conversations = session.exec(
        select(LeadConversation)
        .where(LeadConversation.lead_id == lead.id)
        .order_by(LeadConversation.conversation_time.desc(), LeadConversation.created_at.desc())
    ).all()
    key_events = session.exec(
        select(LeadKeyEvent).where(LeadKeyEvent.lead_id == lead.id).order_by(LeadKeyEvent.event_time.desc())
    ).all()
    previous_snapshot = session.exec(
        select(LeadAnalysisSnapshot)
        .where(LeadAnalysisSnapshot.lead_id == lead.id)
        .order_by(LeadAnalysisSnapshot.analyzed_at.desc())
    ).first()
    analysis = build_lead_analysis_payload(
        lead,
        contacts,
        followups,
        conversations,
        key_events,
        previous_snapshot=previous_snapshot,
        trigger=trigger,
    )
    current = save_lead_analysis_current(session, lead.id, analysis)
    append_lead_analysis_snapshot(session, lead.id, analysis)
    return serialize_lead_analysis_current(current) or {}


def find_duplicate_lead(session: Session, phone: str, company_name: str, contact_name: str) -> Lead | None:
    if phone:
        duplicate_contact = session.exec(select(LeadContact).where(LeadContact.phone == phone)).first()
        if duplicate_contact:
            return session.get(Lead, duplicate_contact.lead_id)
    if company_name and contact_name:
        duplicate_contacts = session.exec(select(LeadContact).where(LeadContact.name == contact_name)).all()
        for contact in duplicate_contacts:
            duplicate_lead = session.get(Lead, contact.lead_id)
            if duplicate_lead and duplicate_lead.company_name == company_name:
                return duplicate_lead
    return None


def convert_lead(session: Session, actor: User, lead: Lead, source: str = "页面") -> Customer:
    if is_dropped_lead(lead):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效线索不能转客户")
    if is_converted_lead(lead):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该线索已经转过客户")
    if not lead.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="线索必须先归属到个人名下")
    primary_contact = get_primary_lead_contact(session, lead.id)
    if not primary_contact:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="线索至少要有一位联系人才能转客户")
    customer = Customer(
        customer_name=lead.company_name,
        source_lead_id=lead.id,
        contact_name=primary_contact.name,
        phone=primary_contact.phone,
        company_name=lead.company_name,
        owner_id=lead.owner_id,
        notes=lead.notes,
        created_by_id=actor.id,
    )
    session.add(customer)
    session.flush()

    if lead.status not in {LEAD_STATUS_FOLLOWING, LEAD_STATUS_HIGH_PROBABILITY, LEAD_STATUS_MUST_WIN}:
        lead.status = LEAD_STATUS_MUST_WIN
    lead.converted_customer_id = customer.id
    lead.converted_at = utcnow()
    lead.converted_by_id = actor.id
    lead.updated_at = utcnow()

    contact = Contact(
        customer_id=customer.id,
        name=primary_contact.name,
        phone=primary_contact.phone,
        job_title=primary_contact.job_title,
        wechat=primary_contact.wechat,
        is_primary=True,
        created_by_id=actor.id,
    )
    session.add(contact)
    write_audit(session, actor, "转客户", "线索", str(lead.id), source=source, details=f"客户编号 {customer.id}")
    return customer


def replace_lead_contacts(
    session: Session,
    lead_id: int,
    contacts: list[dict[str, Any]],
    actor_id: int,
) -> None:
    old_contacts = get_lead_contacts(session, lead_id)
    for item in old_contacts:
        session.delete(item)

    normalized = []
    for index, item in enumerate(contacts):
        normalized.append(
            LeadContact(
                lead_id=lead_id,
                name=item.get("name", "").strip(),
                job_title=item.get("job_title", "").strip(),
                phone=item.get("phone", "").strip(),
                wechat=item.get("wechat", "").strip(),
                is_primary=bool(item.get("is_primary")) if any(c.get("is_primary") for c in contacts) else index == 0,
                created_by_id=actor_id,
            )
        )

    for item in normalized:
        session.add(item)


def parse_assistant_text(message: str) -> dict[str, Any]:
    phone_match = re.search(r"1\d{10}", message)
    contact_match = re.search(r"(联系人姓名|联系人|姓名)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    job_title_match = re.search(r"(职务|岗位|职位)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    wechat_match = re.search(r"(微信号|微信)[:：]?\s*(?:是|叫|为)?\s*([A-Za-z0-9_\-]+)", message)
    company_match = re.search(r"(公司名称|公司|企业名称|企业)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    org_code_match = re.search(r"(组织机构代码|统一社会信用代码)[:：]?\s*([^\s，,。；;]+)", message)
    region_match = re.search(r"(大区|区域)[:：]?\s*(华北|华东|华南|华中|西南|西北|东北)", message)
    source_match = re.search(r"(来源)[:：]?\s*(转介绍|自然流量|KOC/SEM|外呼)", message)
    lead_id_match = re.search(r"(线索|客户)\s*#?(\d+)", message)
    contact_name = contact_match.group(2) if contact_match else ""
    phone = phone_match.group(0) if phone_match else ""
    return {
        "company_name": company_match.group(2) if company_match else "",
        "organization_code": org_code_match.group(2) if org_code_match else "",
        "region": region_match.group(2) if region_match else "",
        "source": source_match.group(2) if source_match else "",
        "contacts": [
            {
                "name": contact_name,
                "job_title": job_title_match.group(2) if job_title_match else "",
                "phone": phone,
                "wechat": wechat_match.group(2) if wechat_match else "",
                "is_primary": True,
            }
        ]
        if contact_name or phone
        else [],
        "target_id": int(lead_id_match.group(2)) if lead_id_match else None,
    }


def is_create_lead_intent(message: str) -> bool:
    patterns = [
        r"创建.*线索",
        r"新建.*线索",
        r"新增.*线索",
        r"录入.*线索",
        r"添加.*线索",
        r"建.*线索",
    ]
    return any(re.search(pattern, message) for pattern in patterns)


def is_list_public_pool_intent(message: str) -> bool:
    patterns = [
        r"公共线索",
        r"公共池",
        r"线索池",
    ]
    return any(re.search(pattern, message) for pattern in patterns)


def is_list_customers_intent(message: str) -> bool:
    patterns = [
        r"查询客户",
        r"查看客户",
        r"我的客户",
        r"客户列表",
    ]
    return any(re.search(pattern, message) for pattern in patterns)


def is_list_leads_intent(message: str) -> bool:
    patterns = [
        r"查询线索",
        r"查看线索",
        r"我的线索",
        r"线索列表",
        r"看看线索",
        r"找.*线索",
    ]
    return any(re.search(pattern, message) for pattern in patterns)


def is_convert_lead_intent(message: str) -> bool:
    patterns = [
        r"转客户",
        r"转成客户",
        r"转为客户",
        r"转换成客户",
    ]
    return any(re.search(pattern, message) for pattern in patterns)


SUPPORTED_ASSISTANT_INTENTS = {
    "create_lead",
    "list_leads",
    "list_public_pool",
    "list_customers",
    "convert_lead",
    "show_config",
    "chat",
    "unknown",
}

DEFAULT_ASSISTANT_CLARIFY_REPLY = "我没有理解您的意思，请您说完整一点。"


def has_meaningful_lead_slots(slots: dict[str, Any]) -> bool:
    contacts = slots.get("contacts", [])
    return any(
        [
            bool(str(slots.get("company_name", "")).strip()),
            bool(str(slots.get("organization_code", "")).strip()),
            bool(str(slots.get("region", "")).strip()),
            bool(str(slots.get("source", "")).strip()),
            isinstance(contacts, list) and len(contacts) > 0,
        ]
    )


def merge_assistant_slots(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "company_name": str(primary.get("company_name") or secondary.get("company_name") or "").strip(),
        "organization_code": str(primary.get("organization_code") or secondary.get("organization_code") or "").strip(),
        "region": str(primary.get("region") or secondary.get("region") or "").strip(),
        "source": str(primary.get("source") or secondary.get("source") or "").strip(),
        "owner_id": primary.get("owner_id") if primary.get("owner_id") is not None else secondary.get("owner_id"),
        "notes": str(primary.get("notes") or secondary.get("notes") or "").strip(),
        "contacts": primary.get("contacts") if primary.get("contacts") else secondary.get("contacts") or [],
    }
    return merged


def build_assistant_fallback_result(
    message: str,
    *,
    current_lead_creation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    parsed = parse_assistant_text(message)
    current_draft = current_lead_creation.get("draft", {}) if current_lead_creation else {}
    parsed_slots = merge_assistant_slots(parsed, current_draft)
    current_message_has_lead_slots = has_meaningful_lead_slots(parsed)

    if is_create_lead_intent(message) or ("线索" in message and current_message_has_lead_slots):
        return {
            "intent": "create_lead",
            "reply": "",
            "confidence": 0.55,
            "slots": merge_assistant_slots(
                {
                    "company_name": parsed_slots.get("company_name", ""),
                    "organization_code": parsed_slots.get("organization_code", ""),
                    "region": parsed_slots.get("region", ""),
                    "source": parsed_slots.get("source", ""),
                    "owner_id": None,
                    "notes": "由智能助手创建",
                    "contacts": parsed_slots.get("contacts", []),
                },
                current_draft,
            ),
            "next_action": "call_skill",
            "target_id": None,
        }

    if current_lead_creation and current_message_has_lead_slots:
        return {
            "intent": "create_lead",
            "reply": "",
            "confidence": 0.52,
            "slots": merge_assistant_slots(
                {
                    "company_name": parsed_slots.get("company_name", ""),
                    "organization_code": parsed_slots.get("organization_code", ""),
                    "region": parsed_slots.get("region", ""),
                    "source": parsed_slots.get("source", ""),
                    "owner_id": None,
                    "notes": "由智能助手创建",
                    "contacts": parsed_slots.get("contacts", []),
                },
                current_draft,
            ),
            "next_action": "call_skill",
            "target_id": None,
        }

    if is_convert_lead_intent(message):
        return {
            "intent": "convert_lead",
            "reply": "",
            "confidence": 0.55,
            "slots": {},
            "next_action": "call_skill",
            "target_id": parsed.get("target_id"),
        }

    if is_list_public_pool_intent(message):
        return {
            "intent": "list_public_pool",
            "reply": "",
            "confidence": 0.55,
            "slots": {},
            "next_action": "call_skill",
            "target_id": None,
        }

    if is_list_customers_intent(message):
        return {
            "intent": "list_customers",
            "reply": "",
            "confidence": 0.55,
            "slots": {},
            "next_action": "call_skill",
            "target_id": None,
        }

    if is_list_leads_intent(message):
        return {
            "intent": "list_leads",
            "reply": "",
            "confidence": 0.55,
            "slots": {},
            "next_action": "call_skill",
            "target_id": None,
        }

    if "跟进方式" in message or "配置" in message:
        return {
            "intent": "show_config",
            "reply": "",
            "confidence": 0.55,
            "slots": {},
            "next_action": "call_skill",
            "target_id": None,
        }

    return {
        "intent": "unknown",
        "reply": DEFAULT_ASSISTANT_CLARIFY_REPLY,
        "confidence": 0.2,
        "slots": {},
        "next_action": "reply",
        "target_id": None,
    }


def normalize_assistant_result(result: dict[str, Any]) -> dict[str, Any]:
    intent = str(result.get("intent") or result.get("kind") or "unknown").strip()
    if intent not in SUPPORTED_ASSISTANT_INTENTS:
        intent = "unknown"

    slots = result.get("slots")
    if not isinstance(slots, dict):
        slots = {
            "company_name": result.get("company_name", ""),
            "organization_code": result.get("organization_code", ""),
            "region": result.get("region", ""),
            "source": result.get("source", ""),
            "owner_id": result.get("owner_id"),
            "notes": result.get("notes", ""),
            "contacts": result.get("contacts", []),
        }

    contacts = slots.get("contacts")
    slots["contacts"] = contacts if isinstance(contacts, list) else []
    slots["company_name"] = str(slots.get("company_name", "")).strip()
    slots["organization_code"] = str(slots.get("organization_code", "")).strip()
    slots["region"] = str(slots.get("region", "")).strip()
    slots["source"] = str(slots.get("source", "")).strip()
    slots["notes"] = str(slots.get("notes", "")).strip()

    reply = str(result.get("reply", "")).strip()
    next_action = str(result.get("next_action", "")).strip() or ("reply" if intent in {"chat", "unknown"} else "call_skill")
    if next_action not in {"reply", "call_skill", "clarify"}:
        next_action = "reply"

    target_id = result.get("target_id")
    try:
        target_id = int(target_id) if target_id is not None else None
    except (TypeError, ValueError):
        target_id = None

    confidence = result.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "intent": intent,
        "reply": reply,
        "confidence": confidence,
        "slots": slots,
        "next_action": next_action,
        "target_id": target_id,
    }


async def try_openai_assistant(
    message: str,
    *,
    context: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not settings.openai_api_key:
        return None

    context_json = json.dumps(context or {}, ensure_ascii=False)
    system_prompt = (
        "你是一个中文 CRM 助手。"
        "你负责先理解用户意图，再决定是直接回复还是调用 CRM skill。"
        "你只能识别以下 intent：create_lead、list_leads、list_public_pool、list_customers、convert_lead、show_config、chat、unknown。"
        "请只返回 JSON，不要返回 markdown。"
        "如果用户是在补充创建线索缺失信息，你要结合 context.current_lead_creation。"
        "如果 intent 是 create_lead，请尽量把线索字段写进 slots。"
        "如果 intent 是 convert_lead，请尽量从用户话里识别 target_id。"
        "JSON 格式为："
        "{\"intent\":\"动作名\",\"next_action\":\"reply|call_skill|clarify\",\"confidence\":0.0,"
        "\"reply\":\"给用户的简短中文说明\",\"target_id\":null,"
        "\"slots\":{\"company_name\":\"\",\"organization_code\":\"\",\"region\":\"\",\"source\":\"\",\"owner_id\":null,\"notes\":\"\","
        "\"contacts\":[{\"name\":\"\",\"job_title\":\"\",\"phone\":\"\",\"wechat\":\"\",\"is_primary\":true}]}}"
    )

    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": f"当前上下文: {context_json}"},
            {"role": "user", "content": message},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{settings.openai_base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not content:
                return None

            return normalize_assistant_result(json.loads(content))
    except Exception:
        return None


def init_demo_data(session: Session) -> None:
    demo_user_specs = [
        ("sales01", "销售一号", ROLE_SALES),
        ("sales02", "销售二号", ROLE_SALES),
        ("manager01", "销售经理", ROLE_MANAGER),
        ("admin01", "系统管理员", ROLE_ADMIN),
    ]
    users_by_login: dict[str, User] = {}
    for login, name, role in demo_user_specs:
        user = session.exec(select(User).where(User.login == login)).first()
        if not user:
            user = User(login=login, name=name, role=role, password_hash=hash_password("123456"))
            session.add(user)
            session.flush()
        users_by_login[login] = user

    users_by_login["sales01"].manager_id = users_by_login["manager01"].id
    users_by_login["sales02"].manager_id = users_by_login["manager01"].id

    configs = {
        "lead_sources": "转介绍,自然流量,KOC/SEM,外呼",
        "followup_methods": "电话,微信,面谈,其他",
    }
    for key, value in configs.items():
        item = session.exec(select(ConfigItem).where(ConfigItem.key == key)).first()
        if not item:
            session.add(ConfigItem(key=key, value=value))

    demo_leads = [
        {
            "company_name": "华北科技",
            "organization_code": "HB-001",
            "region": "华北",
            "source": "转介绍",
            "owner_id": users_by_login["sales01"].id,
            "status": LEAD_STATUS_HIGH_PROBABILITY,
            "notes": "已沟通初步需求",
            "created_by_id": users_by_login["sales01"].id,
            "contact": ("张三", "采购经理", "13800000001", "zhangsancrm"),
            "followup": ("电话", "已确认下周安排产品演示"),
        },
        {
            "company_name": "精工制造",
            "organization_code": "ZZ-002",
            "region": "华东",
            "source": "自然流量",
            "owner_id": None,
            "status": LEAD_STATUS_FOLLOWING,
            "notes": "进入公共线索池待领取",
            "created_by_id": users_by_login["manager01"].id,
            "is_public": True,
            "last_pool_at": utcnow(),
            "contact": ("李四", "运营总监", "13800000002", "lisi-biz"),
            "followup": None,
        },
        {
            "company_name": "星火零售",
            "organization_code": "LS-003",
            "region": "华南",
            "source": "外呼",
            "owner_id": users_by_login["sales02"].id,
            "status": LEAD_STATUS_MUST_WIN,
            "notes": "意向较强，待转客户",
            "created_by_id": users_by_login["sales02"].id,
            "contact": ("王总", "总经理", "13800000003", "wangzong-shop"),
            "followup": ("微信", "客户正在内部评估方案"),
        },
    ]

    for spec in demo_leads:
        lead = session.exec(select(Lead).where(Lead.company_name == spec["company_name"])).first()
        if not lead:
            lead = Lead(
                company_name=spec["company_name"],
                organization_code=spec["organization_code"],
                region=spec["region"],
                source=spec["source"],
                owner_id=spec["owner_id"],
                status=spec["status"],
                notes=spec["notes"],
                created_by_id=spec["created_by_id"],
                is_public=spec.get("is_public", False),
                last_pool_at=spec.get("last_pool_at"),
            )
            session.add(lead)
            session.flush()

        contact_name, job_title, phone, wechat = spec["contact"]
        contact = session.exec(select(LeadContact).where(LeadContact.lead_id == lead.id, LeadContact.phone == phone)).first()
        if not contact:
            session.add(
                LeadContact(
                    lead_id=lead.id,
                    name=contact_name,
                    job_title=job_title,
                    phone=phone,
                    wechat=wechat,
                    is_primary=True,
                    created_by_id=spec["created_by_id"],
                )
            )

        if spec["followup"]:
            method, content = spec["followup"]
            followup = session.exec(
                select(LeadFollowUp).where(LeadFollowUp.lead_id == lead.id, LeadFollowUp.content == content)
            ).first()
            if not followup:
                session.add(
                    LeadFollowUp(
                        lead_id=lead.id,
                        method=method,
                        content=content,
                        created_by_id=spec["created_by_id"],
                    )
                )

    session.commit()
