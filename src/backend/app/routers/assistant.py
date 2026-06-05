from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.lead_domain import convert_lead, ensure_lead_access, get_lead_or_404, is_converted_lead, serialize_lead
from app.models import Customer, Lead, ROLE_ADMIN, ROLE_MANAGER, User
from app.schemas import AssistantRequest
from app.skills.lead_creation import execute_lead_creation_skill, get_lead_creation_context, raise_for_invalid_skill_result
from app.services import (
    DEFAULT_ASSISTANT_CLARIFY_REPLY,
    build_assistant_fallback_result,
    has_meaningful_lead_slots,
    merge_assistant_slots,
    parse_assistant_text,
    get_config_values,
    serialize_customer,
    split_config_value,
    try_openai_assistant,
)

router = APIRouter()


@router.post("/assistant/message")
async def assistant_message(
    body: AssistantRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if body.confirm_action:
        if body.confirm_action.kind == "convert_lead":
            lead_id = int(body.confirm_action.payload.get("lead_id", 0))
            lead = get_lead_or_404(session, lead_id)
            if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN} and lead.owner_id != current_user.id:
                raise HTTPException(status_code=403, detail="无权转化该线索")
            customer = convert_lead(session, current_user, lead, source="智能助手")
            session.add(lead)
            session.commit()
            session.refresh(customer)
            return {
                "message": f"线索 {lead.id} 已成功转成客户 {customer.customer_name}",
                "result_kind": "customer_created",
                "data": {"customer": serialize_customer(session, customer), "lead": serialize_lead(session, lead)},
            }
        raise HTTPException(status_code=400, detail="暂不支持该确认动作")

    message = body.message.strip()
    if not message:
        return {
            "message": "你可以让我创建线索、查询线索、查看公共线索池、查询客户，或者发起转客户。",
            "result_kind": "message",
            "data": {},
        }

    lead_creation_context = get_lead_creation_context(session, current_user.id, body.session_id)
    model_context = {
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "role": current_user.role,
        },
        "current_lead_creation": lead_creation_context,
        "allowed_intents": [
            "create_lead",
            "list_leads",
            "list_public_pool",
            "list_customers",
            "convert_lead",
            "show_config",
            "chat",
            "unknown",
        ],
    }
    routed = await try_openai_assistant(message, context=model_context)
    if not routed:
        routed = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)

    intent = str(routed.get("intent", "unknown")).strip()
    next_action = str(routed.get("next_action", "reply")).strip()
    reply = str(routed.get("reply", "")).strip()
    slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}
    parsed_slots = parse_assistant_text(message)
    current_draft = lead_creation_context.get("draft", {}) if lead_creation_context else {}

    if intent == "create_lead":
        slots = merge_assistant_slots(slots, merge_assistant_slots(parsed_slots, current_draft))
        routed["slots"] = slots
    elif intent == "unknown":
        fallback = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)
        if fallback.get("intent") != "unknown":
            routed = fallback
            intent = str(routed.get("intent", "unknown")).strip()
            next_action = str(routed.get("next_action", "reply")).strip()
            reply = str(routed.get("reply", "")).strip()
            slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}
        elif lead_creation_context and has_meaningful_lead_slots(merge_assistant_slots(parsed_slots, current_draft)):
            routed = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)
            intent = str(routed.get("intent", "unknown")).strip()
            next_action = str(routed.get("next_action", "reply")).strip()
            reply = str(routed.get("reply", "")).strip()
            slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}

    if intent != "create_lead" and next_action in {"reply", "clarify"} and reply:
        return {
            "message": reply,
            "result_kind": "message",
            "data": {
                "intent": intent,
                "confidence": routed.get("confidence", 0),
                "session_id": lead_creation_context["session_id"] if lead_creation_context else body.session_id,
            },
        }

    if intent == "create_lead":
        skill_result = execute_lead_creation_skill(
            session,
            current_user,
            {
                "company_name": slots.get("company_name", ""),
                "organization_code": slots.get("organization_code", ""),
                "region": slots.get("region", ""),
                "source": slots.get("source", ""),
                "owner_id": slots.get("owner_id"),
                "notes": slots.get("notes") or "由智能助手创建",
                "contacts": slots.get("contacts", []),
            },
            source="智能助手",
            session_id=body.session_id,
        )
        raise_for_invalid_skill_result(skill_result)

        if skill_result["status"] == "missing_fields":
            return {
                "message": f"创建线索还缺少必要信息，请至少提供：{'、'.join(skill_result['missing_fields'])}。",
                "result_kind": "message",
                "data": {
                    "status": skill_result["status"],
                    "missing_fields": skill_result["missing_fields"],
                    "draft": skill_result["draft"],
                    "session_id": skill_result["session_id"],
                },
            }

        if skill_result["status"] == "duplicate_found":
            duplicate_lead = skill_result["duplicate_lead"]
            return {
                "message": (
                    f"我发现这条线索可能已经存在。"
                    f"重复线索编号是 {duplicate_lead['id']}，"
                    f"公司名称是 {duplicate_lead['company_name']}，"
                    f"主联系人是 {duplicate_lead['primary_contact_name'] or '未填写'}，"
                    f"手机号是 {duplicate_lead['primary_contact_phone'] or '未填写'}。"
                    f"你可以先查看已有线索，再决定是否放弃本次创建。"
                ),
                "result_kind": "message",
                "data": {
                    "status": skill_result["status"],
                    "duplicate_lead": duplicate_lead,
                    "draft": skill_result["draft"],
                    "session_id": skill_result["session_id"],
                    "available_actions": skill_result["available_actions"],
                },
            }

        lead = skill_result["lead"]
        return {
            "message": f"已为你创建线索：{lead['company_name']}",
            "result_kind": "lead_created",
            "data": {
                "status": skill_result["status"],
                "lead": lead,
                "session_id": skill_result["session_id"],
            },
        }

    if intent == "list_public_pool":
        leads = [
            item
            for item in session.exec(select(Lead).where(Lead.is_public == True).order_by(Lead.updated_at.desc())).all()  # noqa: E712
            if not is_converted_lead(item)
        ]
        return {
            "message": f"当前公共线索池共有 {len(leads)} 条线索。",
            "result_kind": "lead_list",
            "data": {"leads": [serialize_lead(session, item) for item in leads[:8]]},
        }

    if intent == "list_customers":
        statement = select(Customer)
        if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
            statement = statement.where(Customer.owner_id == current_user.id)
        customers = session.exec(statement.order_by(Customer.updated_at.desc())).all()
        return {
            "message": f"共查询到 {len(customers)} 位客户。",
            "result_kind": "customer_list",
            "data": {"customers": [serialize_customer(session, item) for item in customers[:8]]},
        }

    if intent == "list_leads":
        statement = select(Lead).where(Lead.is_public == False)  # noqa: E712
        if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
            statement = statement.where(Lead.owner_id == current_user.id)
        leads = [item for item in session.exec(statement.order_by(Lead.updated_at.desc())).all() if not is_converted_lead(item)]
        return {
            "message": f"共查询到 {len(leads)} 条线索。",
            "result_kind": "lead_list",
            "data": {"leads": [serialize_lead(session, item) for item in leads[:8]]},
        }

    if intent == "convert_lead":
        lead_id = routed.get("target_id")
        if not lead_id:
            return {
                "message": "请告诉我具体要转化哪一条线索，比如：转客户 3。",
                "result_kind": "message",
                "data": {},
            }
        lead = get_lead_or_404(session, lead_id)
        if lead.is_public and current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
            raise HTTPException(status_code=403, detail="公共线索仅支持领取后再发起转客户")
        if not lead.is_public:
            ensure_lead_access(current_user, lead)
        return {
            "message": f"准备将线索 {lead.id} 转成客户，请点击确认执行。",
            "result_kind": "draft_action",
            "data": {
                "lead": serialize_lead(session, lead),
                "draft_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}},
            },
        }

    if intent == "show_config":
        config = get_config_values(session)
        return {
            "message": "这是当前的基础配置。",
            "result_kind": "message",
            "data": {
                "lead_sources": split_config_value(config.get("lead_sources", "")),
                "followup_methods": split_config_value(config.get("followup_methods", "")),
            },
        }

    return {
        "message": reply or DEFAULT_ASSISTANT_CLARIFY_REPLY,
        "result_kind": "message",
        "data": {"intent": intent, "confidence": routed.get("confidence", 0)},
    }
