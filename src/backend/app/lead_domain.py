import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models import (
    Contact,
    Customer,
    LEGACY_LEAD_STATUS_INVALID,
    Lead,
    LeadAnalysisCurrent,
    LeadAnalysisSnapshot,
    LeadContact,
    LeadConversation,
    LeadFollowUp,
    LeadKeyEvent,
    LEAD_STATUS_DROPPED,
    LEAD_STATUS_FOLLOWING,
    LEAD_STATUS_HIGH_PROBABILITY,
    LEAD_STATUS_HIGH_RISK,
    LEAD_STATUS_MUST_WIN,
    User,
)
from app.services import is_manager_or_admin, utcnow, write_audit


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_dropped_lead(lead: Lead) -> bool:
    return lead.status in {LEAD_STATUS_DROPPED, LEGACY_LEAD_STATUS_INVALID}


def is_converted_lead(lead: Lead) -> bool:
    return lead.converted_customer_id is not None


def ensure_lead_access(user: User, lead: Lead) -> None:
    if is_manager_or_admin(user):
        return
    if lead.owner_id == user.id:
        return
    if lead.owner_id is None and lead.created_by_id == user.id:
        return
    if lead.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该线索")


def get_lead_or_404(session: Session, lead_id: int) -> Lead:
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线索不存在")
    return lead


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
