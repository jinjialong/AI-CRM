from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, or_, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import (
    LEGACY_LEAD_STATUS_CONVERTED,
    LEGACY_LEAD_STATUS_INVALID,
    Lead,
    LeadAnalysisCurrent,
    LeadAnalysisSnapshot,
    LeadConversation,
    LeadFollowUp,
    LeadKeyEvent,
    LEAD_STATUS_DROPPED,
    LEAD_STATUS_FOLLOWING,
    LEAD_STATUS_HIGH_PROBABILITY,
    LEAD_STATUS_HIGH_RISK,
    LEAD_STATUS_MUST_WIN,
    ROLE_ADMIN,
    ROLE_MANAGER,
    User,
)
from app.schemas import (
    AssignLeadRequest,
    ConvertLeadRequest,
    FollowUpCreateRequest,
    LeadConversationCreateRequest,
    LeadCreateRequest,
    LeadKeyEventCreateRequest,
    LeadUpdateRequest,
)
from app.services import (
    convert_lead,
    ensure_lead_access,
    find_duplicate_lead,
    get_config_values,
    get_lead_or_404,
    get_user_or_404,
    is_converted_lead,
    is_dropped_lead,
    rebuild_lead_analysis,
    replace_lead_contacts,
    serialize_lead_analysis_current,
    serialize_lead_analysis_snapshot,
    serialize_lead_conversation,
    serialize_lead_key_event,
    serialize_lead,
    serialize_lead_followup,
    split_config_value,
    update_model,
    utcnow,
    write_audit,
)

router = APIRouter()


def _visible_leads(session: Session, current_user: User) -> list[Lead]:
    statement = select(Lead)
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        statement = statement.where(
            or_(
                Lead.owner_id == current_user.id,
                (Lead.owner_id == None) & (Lead.created_by_id == current_user.id),  # noqa: E711
            )
        )
    return session.exec(statement).all()


def _normalize_requested_status(status_value: str) -> str:
    normalized = status_value.strip()
    if normalized == "必赢":
        return LEAD_STATUS_MUST_WIN
    if normalized == LEGACY_LEAD_STATUS_INVALID:
        return LEAD_STATUS_DROPPED
    if normalized == LEGACY_LEAD_STATUS_CONVERTED:
        raise HTTPException(status_code=400, detail="请通过转客户操作完成客户转化")
    if normalized not in {
        LEAD_STATUS_FOLLOWING,
        LEAD_STATUS_MUST_WIN,
        LEAD_STATUS_HIGH_PROBABILITY,
        LEAD_STATUS_HIGH_RISK,
        LEAD_STATUS_DROPPED,
    }:
        raise HTTPException(status_code=400, detail="线索状态无效")
    return normalized


def _matches_search(lead_data: dict, search: str) -> bool:
    if not search:
        return True
    keyword = search.strip()
    if not keyword:
        return True
    text_fields = [
        lead_data.get("company_name", ""),
        lead_data.get("organization_code", ""),
        lead_data.get("region", ""),
        lead_data.get("primary_contact_name", ""),
        lead_data.get("primary_contact_phone", ""),
    ]
    return any(keyword in str(item) for item in text_fields)


@router.get("/leads")
def list_leads(
    search: str = "",
    status: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    leads = [
        lead
        for lead in _visible_leads(session, current_user)
        if not lead.is_public and not is_converted_lead(lead)
    ]
    serialized = [serialize_lead(session, lead) for lead in leads]
    if search:
        serialized = [item for item in serialized if _matches_search(item, search)]
    if status:
        serialized = [item for item in serialized if item["status"] == status]
    serialized.sort(key=lambda item: item["updated_at"], reverse=True)
    return {"items": serialized}


@router.get("/leads/public-pool")
def list_public_pool(
    search: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    leads = [
        item
        for item in session.exec(select(Lead).where(Lead.is_public == True)).all()  # noqa: E712
        if not is_converted_lead(item)
    ]
    serialized = [serialize_lead(session, lead) for lead in leads]
    if search:
        serialized = [item for item in serialized if _matches_search(item, search)]
    serialized.sort(key=lambda item: item["updated_at"], reverse=True)
    return {"items": serialized}


@router.post("/leads")
def create_lead(
    body: LeadCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not body.company_name.strip():
        raise HTTPException(status_code=400, detail="公司名称不能为空")
    contacts = [item.model_dump() for item in body.contacts if item.name.strip() or item.phone.strip()]
    if not contacts:
        raise HTTPException(status_code=400, detail="至少需要填写一组联系人")
    primary_contact = contacts[0]
    duplicate = find_duplicate_lead(
        session,
        primary_contact.get("phone", "").strip(),
        body.company_name.strip(),
        primary_contact.get("name", "").strip(),
    )
    if duplicate:
        raise HTTPException(status_code=400, detail=f"发现疑似重复线索，编号为 {duplicate.id}")

    owner_id = body.owner_id
    owner = get_user_or_404(session, owner_id) if owner_id else None
    lead = Lead(
        company_name=body.company_name.strip(),
        organization_code=body.organization_code.strip(),
        region=body.region.strip(),
        source=body.source.strip(),
        owner_id=owner.id if owner else None,
        notes=body.notes.strip(),
        created_by_id=current_user.id,
        updated_at=utcnow(),
    )
    session.add(lead)
    session.flush()
    replace_lead_contacts(session, lead.id, contacts, current_user.id)
    write_audit(session, current_user, "创建线索", "线索", str(lead.id))
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.get("/leads/{lead_id}")
def get_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    if lead.is_public and current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        raise HTTPException(status_code=403, detail="公共线索详情仅支持领取后查看")
    if not lead.is_public:
        ensure_lead_access(current_user, lead)
    followups = session.exec(
        select(LeadFollowUp).where(LeadFollowUp.lead_id == lead_id).order_by(LeadFollowUp.created_at.desc())
    ).all()
    config = get_config_values(session)
    return {
        "lead": serialize_lead(session, lead),
        "followups": [serialize_lead_followup(session, item) for item in followups],
        "followup_methods": split_config_value(config.get("followup_methods", "电话,微信,面谈,其他")),
    }


@router.patch("/leads/{lead_id}")
def update_lead(
    lead_id: int,
    body: LeadUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    previous_status = lead.status
    payload = body.model_dump(exclude_none=True)
    contacts = payload.pop("contacts", None)
    owner_id = payload.pop("owner_id", None)
    if "status" in payload:
        payload["status"] = _normalize_requested_status(str(payload["status"]))

    if "company_name" in payload and not str(payload["company_name"]).strip():
        raise HTTPException(status_code=400, detail="公司名称不能为空")

    if owner_id is not None:
        if owner_id:
            owner = get_user_or_404(session, owner_id)
            lead.owner_id = owner.id
        else:
            lead.owner_id = None

    update_model(lead, payload)
    lead.updated_at = utcnow()

    if contacts is not None:
        normalized_contacts = [item for item in contacts if item.get("name", "").strip() or item.get("phone", "").strip()]
        if not normalized_contacts:
            raise HTTPException(status_code=400, detail="至少需要保留一组联系人")
        primary_contact = normalized_contacts[0]
        duplicate = find_duplicate_lead(
            session,
            primary_contact.get("phone", "").strip(),
            lead.company_name.strip(),
            primary_contact.get("name", "").strip(),
        )
        if duplicate and duplicate.id != lead.id:
            raise HTTPException(status_code=400, detail=f"发现疑似重复线索，编号为 {duplicate.id}")
        replace_lead_contacts(session, lead.id, normalized_contacts, current_user.id)

    write_audit(session, current_user, "编辑线索", "线索", str(lead.id))
    session.add(lead)
    changed_keys = set(payload.keys())
    if contacts is not None:
        changed_keys.add("contacts")
    if owner_id is not None:
        changed_keys.add("owner_id")
    needs_analysis_rebuild = bool(
        changed_keys.intersection({"company_name", "organization_code", "region", "status", "notes", "contacts", "owner_id"})
    )
    if needs_analysis_rebuild:
        trigger = {
            "type": "status_changed" if lead.status != previous_status else "lead_updated",
            "label": "状态变更" if lead.status != previous_status else "编辑线索",
            "ref_id": lead.id,
        }
        rebuild_lead_analysis(session, lead, trigger=trigger)
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/followups")
def create_lead_followup(
    lead_id: int,
    body: FollowUpCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    followup = LeadFollowUp(
        lead_id=lead_id,
        method=body.method,
        content=body.content,
        follow_up_time=body.follow_up_time or utcnow(),
        next_follow_up_time=body.next_follow_up_time,
        created_by_id=current_user.id,
    )
    lead.updated_at = utcnow()
    session.add(followup)
    session.add(lead)
    session.flush()
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "followup_created", "label": "新增跟进", "ref_id": followup.id},
    )
    write_audit(session, current_user, "新增线索跟进", "线索", str(lead.id))
    session.commit()
    session.refresh(followup)
    return serialize_lead_followup(session, followup)


@router.post("/leads/{lead_id}/return-to-pool")
def return_lead_to_pool(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    if is_converted_lead(lead):
        raise HTTPException(status_code=400, detail="已转客户线索不能退回公共池")
    if is_dropped_lead(lead):
        raise HTTPException(status_code=400, detail="已丢弃线索不能退回公共池")
    lead.is_public = True
    lead.owner_id = None
    lead.last_pool_at = utcnow()
    lead.updated_at = utcnow()
    session.add(lead)
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "lead_returned_to_pool", "label": "退回公共池", "ref_id": lead.id},
    )
    write_audit(session, current_user, "退回公共线索池", "线索", str(lead.id))
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/mark-lost")
def mark_lead_lost(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    if is_converted_lead(lead):
        raise HTTPException(status_code=400, detail="已转客户线索不能标记流失")
    if is_dropped_lead(lead):
        raise HTTPException(status_code=400, detail="该线索已经是已丢弃状态")
    lead.status = LEAD_STATUS_DROPPED
    lead.updated_at = utcnow()
    session.add(lead)
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "lead_marked_lost", "label": "标记已丢弃", "ref_id": lead.id},
    )
    write_audit(session, current_user, "标记已丢弃", "线索", str(lead.id))
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/claim")
def claim_public_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    if not lead.is_public:
        raise HTTPException(status_code=400, detail="该线索不在公共线索池中")
    if is_converted_lead(lead):
        raise HTTPException(status_code=400, detail="已转客户线索不能领取")
    if is_dropped_lead(lead):
        raise HTTPException(status_code=400, detail="已丢弃线索不能领取")
    lead.is_public = False
    lead.owner_id = current_user.id
    lead.last_claimed_at = utcnow()
    lead.updated_at = utcnow()
    session.add(lead)
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "lead_claimed", "label": "领取公共线索", "ref_id": lead.id},
    )
    write_audit(session, current_user, "领取公共线索", "线索", str(lead.id))
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/assign")
def assign_public_lead(
    lead_id: int,
    body: AssignLeadRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        raise HTTPException(status_code=403, detail="只有销售经理和系统管理员可以分配线索")
    lead = get_lead_or_404(session, lead_id)
    owner = get_user_or_404(session, body.owner_id)
    if is_converted_lead(lead):
        raise HTTPException(status_code=400, detail="已转客户线索不能分配")
    if is_dropped_lead(lead):
        raise HTTPException(status_code=400, detail="已丢弃线索不能分配")
    lead.is_public = False
    lead.owner_id = owner.id
    lead.last_assigned_at = utcnow()
    lead.updated_at = utcnow()
    session.add(lead)
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "lead_assigned", "label": "分配公共线索", "ref_id": lead.id},
    )
    write_audit(session, current_user, "分配公共线索", "线索", str(lead.id), details=f"分配给 {owner.name}")
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/force-reclaim")
def force_reclaim_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        raise HTTPException(status_code=403, detail="只有销售经理和系统管理员可以强制收回")
    lead = get_lead_or_404(session, lead_id)
    if is_converted_lead(lead):
        raise HTTPException(status_code=400, detail="已转客户线索不能收回公共池")
    if is_dropped_lead(lead):
        raise HTTPException(status_code=400, detail="已丢弃线索不能收回公共池")
    lead.is_public = True
    lead.owner_id = None
    lead.last_pool_at = utcnow()
    lead.updated_at = utcnow()
    session.add(lead)
    rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "lead_force_reclaimed", "label": "强制收回", "ref_id": lead.id},
    )
    write_audit(session, current_user, "强制收回线索", "线索", str(lead.id))
    session.commit()
    session.refresh(lead)
    return serialize_lead(session, lead)


@router.post("/leads/{lead_id}/convert")
def convert_lead_to_customer(
    lead_id: int,
    body: ConvertLeadRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    if not body.confirm:
        raise HTTPException(status_code=400, detail="转客户必须二次确认")
    customer = convert_lead(session, current_user, lead)
    session.add(lead)
    session.commit()
    session.refresh(customer)
    session.refresh(lead)
    return {"lead": serialize_lead(session, lead), "customer": {"id": customer.id, "customer_name": customer.customer_name}}


@router.get("/leads/{lead_id}/analysis")
def get_lead_analysis(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    current = session.exec(select(LeadAnalysisCurrent).where(LeadAnalysisCurrent.lead_id == lead_id)).first()
    if not current:
        rebuild_lead_analysis(session, lead)
        session.commit()
        current = session.exec(select(LeadAnalysisCurrent).where(LeadAnalysisCurrent.lead_id == lead_id)).first()
    return {"current": serialize_lead_analysis_current(current)}


@router.post("/leads/{lead_id}/analysis/rebuild")
def rebuild_analysis(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    current = rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "manual_rebuild", "label": "手动重新分析", "ref_id": lead.id},
    )
    write_audit(session, current_user, "重新分析线索", "线索", str(lead.id))
    session.commit()
    return {"current": current}


@router.get("/leads/{lead_id}/analysis/trend")
def get_lead_analysis_trend(
    lead_id: int,
    days: int = 30,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    items = session.exec(
        select(LeadAnalysisSnapshot)
        .where(LeadAnalysisSnapshot.lead_id == lead_id)
        .order_by(LeadAnalysisSnapshot.analyzed_at.asc())
    ).all()
    if days > 0 and len(items) > days:
        items = items[-days:]
    return {"items": [serialize_lead_analysis_snapshot(item) for item in items]}


@router.get("/leads/{lead_id}/conversations")
def list_lead_conversations(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    items = session.exec(
        select(LeadConversation)
        .where(LeadConversation.lead_id == lead_id)
        .order_by(LeadConversation.conversation_time.desc(), LeadConversation.created_at.desc())
    ).all()
    return {"items": [serialize_lead_conversation(session, item) for item in items]}


@router.post("/leads/{lead_id}/conversations")
def create_lead_conversation(
    lead_id: int,
    body: LeadConversationCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    item = LeadConversation(
        lead_id=lead_id,
        source_type=body.source_type,
        content=body.content,
        conversation_time=body.conversation_time or utcnow(),
        created_by_id=current_user.id,
    )
    lead.updated_at = utcnow()
    session.add(item)
    session.add(lead)
    session.flush()
    current = rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "conversation_created", "label": "新增对话记录", "ref_id": item.id},
    )
    write_audit(session, current_user, "新增线索对话记录", "线索", str(lead.id))
    session.commit()
    session.refresh(item)
    return {"item": serialize_lead_conversation(session, item), "current": current}


@router.delete("/leads/conversations/{conversation_id}")
def delete_lead_conversation(
    conversation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    item = session.get(LeadConversation, conversation_id)
    if not item:
        raise HTTPException(status_code=404, detail="对话记录不存在")
    lead = get_lead_or_404(session, item.lead_id)
    ensure_lead_access(current_user, lead)
    session.delete(item)
    lead.updated_at = utcnow()
    session.add(lead)
    current = rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "conversation_deleted", "label": "删除对话记录", "ref_id": conversation_id},
    )
    write_audit(session, current_user, "删除线索对话记录", "线索", str(lead.id))
    session.commit()
    return {"current": current}


@router.get("/leads/{lead_id}/key-events")
def list_lead_key_events(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    items = session.exec(
        select(LeadKeyEvent).where(LeadKeyEvent.lead_id == lead_id).order_by(LeadKeyEvent.event_time.desc())
    ).all()
    return {"items": [serialize_lead_key_event(session, item) for item in items]}


@router.post("/leads/{lead_id}/key-events")
def create_lead_key_event(
    lead_id: int,
    body: LeadKeyEventCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lead = get_lead_or_404(session, lead_id)
    ensure_lead_access(current_user, lead)
    item = LeadKeyEvent(
        lead_id=lead_id,
        event_type=body.event_type,
        event_time=body.event_time or utcnow(),
        note=body.note,
        created_by_id=current_user.id,
    )
    lead.updated_at = utcnow()
    session.add(item)
    session.add(lead)
    session.flush()
    current = rebuild_lead_analysis(
        session,
        lead,
        trigger={"type": "key_event_created", "label": "新增关键事件", "ref_id": item.id},
    )
    write_audit(session, current_user, "新增线索关键事件", "线索", str(lead.id))
    session.commit()
    session.refresh(item)
    return {"item": serialize_lead_key_event(session, item), "current": current}
