from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import AssistantSession, Lead, User
from app.schemas import LeadContactInput
from app.services import find_duplicate_lead, replace_lead_contacts, serialize_lead, utcnow, write_audit

LEAD_CREATION_SKILL_MISSING_FIELDS = "missing_fields"
LEAD_CREATION_SKILL_DUPLICATE_FOUND = "duplicate_found"
LEAD_CREATION_SKILL_SUCCESS = "success"

LEAD_CREATION_SCENE = "lead_creation"


def _normalize_contact_item(item: LeadContactInput | dict[str, Any], index: int) -> dict[str, Any]:
    if isinstance(item, LeadContactInput):
        payload = item.model_dump()
    else:
        payload = dict(item)
    return {
        "name": str(payload.get("name", "")).strip(),
        "job_title": str(payload.get("job_title", "")).strip(),
        "phone": str(payload.get("phone", "")).strip(),
        "wechat": str(payload.get("wechat", "")).strip(),
        "is_primary": bool(payload.get("is_primary")) if index == 0 else bool(payload.get("is_primary")),
    }


def _empty_draft() -> dict[str, Any]:
    return {
        "company_name": "",
        "organization_code": "",
        "region": "",
        "source": "",
        "owner_id": None,
        "notes": "",
        "contacts": [],
    }


def build_lead_creation_draft(payload: dict[str, Any]) -> dict[str, Any]:
    contacts = payload.get("contacts", []) or []
    normalized_contacts = [_normalize_contact_item(item, index) for index, item in enumerate(contacts)]
    return {
        "company_name": str(payload.get("company_name", "")).strip(),
        "organization_code": str(payload.get("organization_code", "")).strip(),
        "region": str(payload.get("region", "")).strip(),
        "source": str(payload.get("source", "")).strip(),
        "owner_id": payload.get("owner_id"),
        "notes": str(payload.get("notes", "")).strip(),
        "contacts": normalized_contacts,
    }


def merge_lead_creation_draft(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    contacts = extra.get("contacts") or base.get("contacts") or []
    return {
        "company_name": extra.get("company_name") or base.get("company_name", ""),
        "organization_code": extra.get("organization_code") or base.get("organization_code", ""),
        "region": extra.get("region") or base.get("region", ""),
        "source": extra.get("source") or base.get("source", ""),
        "owner_id": extra.get("owner_id") if extra.get("owner_id") is not None else base.get("owner_id"),
        "notes": extra.get("notes") or base.get("notes", ""),
        "contacts": contacts,
    }


def validate_lead_creation_draft(draft: dict[str, Any]) -> dict[str, Any]:
    contacts = draft.get("contacts", [])
    primary_contact = contacts[0] if contacts else None
    missing_fields = [
        "公司名称" if not draft.get("company_name") else "",
        "联系人姓名" if not primary_contact or not primary_contact.get("name") else "",
        "手机号" if not primary_contact or not primary_contact.get("phone") else "",
    ]
    return {
        "status": LEAD_CREATION_SKILL_SUCCESS if not [item for item in missing_fields if item] else LEAD_CREATION_SKILL_MISSING_FIELDS,
        "missing_fields": [item for item in missing_fields if item],
        "draft": draft,
    }


def check_duplicate_lead_draft(session: Session, draft: dict[str, Any]) -> dict[str, Any]:
    contacts = draft.get("contacts", [])
    primary_contact = contacts[0] if contacts else {}
    duplicate = find_duplicate_lead(
        session,
        str(primary_contact.get("phone", "")).strip(),
        str(draft.get("company_name", "")).strip(),
        str(primary_contact.get("name", "")).strip(),
    )
    if not duplicate:
        return {
            "status": LEAD_CREATION_SKILL_SUCCESS,
            "duplicate_lead": None,
        }
    return {
        "status": LEAD_CREATION_SKILL_DUPLICATE_FOUND,
        "duplicate_lead": serialize_lead(session, duplicate),
    }


def get_or_create_assistant_session(
    session: Session,
    user_id: int,
    scene: str,
    session_id: int | None = None,
) -> AssistantSession:
    assistant_session = None
    if session_id:
        assistant_session = session.get(AssistantSession, session_id)
        if assistant_session and assistant_session.user_id != user_id:
            assistant_session = None
    if assistant_session:
        return assistant_session
    assistant_session = session.exec(
        select(AssistantSession)
        .where(AssistantSession.user_id == user_id)
        .where(AssistantSession.scene == scene)
        .where(AssistantSession.status == "active")
        .order_by(AssistantSession.updated_at.desc())
    ).first()
    if assistant_session:
        return assistant_session
    assistant_session = AssistantSession(
        user_id=user_id,
        scene=scene,
        status="active",
        draft_payload=json.dumps(_empty_draft(), ensure_ascii=False),
        updated_at=utcnow(),
    )
    session.add(assistant_session)
    session.commit()
    session.refresh(assistant_session)
    return assistant_session


def get_assistant_session_or_404(session: Session, user_id: int, session_id: int) -> AssistantSession:
    assistant_session = session.get(AssistantSession, session_id)
    if not assistant_session or assistant_session.user_id != user_id:
        raise HTTPException(status_code=404, detail="会话不存在")
    return assistant_session


def load_assistant_session_draft(assistant_session: AssistantSession) -> dict[str, Any]:
    try:
        payload = json.loads(assistant_session.draft_payload or "{}")
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    return _empty_draft()


def save_assistant_session_draft(session: Session, assistant_session: AssistantSession, draft: dict[str, Any], status: str = "active") -> AssistantSession:
    assistant_session.draft_payload = json.dumps(draft, ensure_ascii=False)
    assistant_session.status = status
    assistant_session.updated_at = utcnow()
    session.add(assistant_session)
    session.commit()
    session.refresh(assistant_session)
    return assistant_session


def discard_lead_creation_session(session: Session, user_id: int, session_id: int) -> dict[str, Any]:
    assistant_session = get_assistant_session_or_404(session, user_id, session_id)
    save_assistant_session_draft(session, assistant_session, _empty_draft(), status="discarded")
    return {
        "status": "discarded",
        "session_id": assistant_session.id,
    }


def get_lead_creation_context(session: Session, user_id: int, session_id: int | None = None) -> dict[str, Any] | None:
    assistant_session: AssistantSession | None = None

    if session_id:
        assistant_session = session.get(AssistantSession, session_id)
        if (
            not assistant_session
            or assistant_session.user_id != user_id
            or assistant_session.scene != LEAD_CREATION_SCENE
            or assistant_session.status != "active"
        ):
            assistant_session = None

    if not assistant_session:
        assistant_session = session.exec(
            select(AssistantSession)
            .where(AssistantSession.user_id == user_id)
            .where(AssistantSession.scene == LEAD_CREATION_SCENE)
            .where(AssistantSession.status == "active")
            .order_by(AssistantSession.updated_at.desc())
        ).first()

    if not assistant_session:
        return None

    return {
        "session_id": assistant_session.id,
        "scene": assistant_session.scene,
        "status": assistant_session.status,
        "draft": load_assistant_session_draft(assistant_session),
    }


def execute_lead_creation_skill(
    session: Session,
    actor: User,
    payload: dict[str, Any],
    source: str = "智能助手",
    session_id: int | None = None,
) -> dict[str, Any]:
    assistant_session = get_or_create_assistant_session(session, actor.id, LEAD_CREATION_SCENE, session_id)
    current_draft = load_assistant_session_draft(assistant_session)
    merged_draft = merge_lead_creation_draft(current_draft, build_lead_creation_draft(payload))

    if not merged_draft.get("source"):
        merged_draft["source"] = "自然流量"

    validation = validate_lead_creation_draft(merged_draft)
    if validation["status"] == LEAD_CREATION_SKILL_MISSING_FIELDS:
        save_assistant_session_draft(session, assistant_session, merged_draft)
        return {
            "status": LEAD_CREATION_SKILL_MISSING_FIELDS,
            "missing_fields": validation["missing_fields"],
            "duplicate_lead": None,
            "lead": None,
            "draft": merged_draft,
            "session_id": assistant_session.id,
            "available_actions": [],
        }

    duplicate_result = check_duplicate_lead_draft(session, merged_draft)
    if duplicate_result["status"] == LEAD_CREATION_SKILL_DUPLICATE_FOUND:
        save_assistant_session_draft(session, assistant_session, merged_draft)
        return {
            "status": LEAD_CREATION_SKILL_DUPLICATE_FOUND,
            "missing_fields": [],
            "duplicate_lead": duplicate_result["duplicate_lead"],
            "lead": None,
            "draft": merged_draft,
            "session_id": assistant_session.id,
            "available_actions": [
                {
                    "kind": "view_duplicate_lead",
                    "label": "查看已有线索",
                    "payload": {"lead_id": duplicate_result["duplicate_lead"]["id"]},
                },
                {
                    "kind": "discard_creation",
                    "label": "放弃创建",
                    "payload": {"session_id": assistant_session.id},
                },
            ],
        }

    lead = Lead(
        company_name=merged_draft["company_name"],
        organization_code=merged_draft["organization_code"],
        region=merged_draft["region"],
        source=merged_draft["source"],
        owner_id=merged_draft["owner_id"],
        notes=merged_draft["notes"] or "由智能助手创建",
        created_by_id=actor.id,
        updated_at=utcnow(),
    )
    session.add(lead)
    session.flush()
    replace_lead_contacts(session, lead.id, merged_draft["contacts"], actor.id)
    write_audit(session, actor, "创建线索", "线索", str(lead.id), source=source)
    session.commit()
    session.refresh(lead)

    save_assistant_session_draft(session, assistant_session, _empty_draft(), status="completed")
    return {
        "status": LEAD_CREATION_SKILL_SUCCESS,
        "missing_fields": [],
        "duplicate_lead": None,
        "lead": serialize_lead(session, lead),
        "draft": {},
        "session_id": assistant_session.id,
        "available_actions": [],
    }


def raise_for_invalid_skill_result(result: dict[str, Any]) -> None:
    status = result.get("status")
    if status in {
        LEAD_CREATION_SKILL_MISSING_FIELDS,
        LEAD_CREATION_SKILL_DUPLICATE_FOUND,
        LEAD_CREATION_SKILL_SUCCESS,
    }:
        return
    raise HTTPException(status_code=400, detail="AI 新建线索技能执行失败")
