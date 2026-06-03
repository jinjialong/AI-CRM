from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import Customer, Lead, ROLE_ADMIN, ROLE_MANAGER, User
from app.schemas import AssistantRequest
from app.skills.lead_creation import execute_lead_creation_skill, raise_for_invalid_skill_result
from app.services import (
    convert_lead,
    get_config_values,
    get_lead_or_404,
    is_convert_lead_intent,
    is_create_lead_intent,
    is_list_customers_intent,
    is_list_leads_intent,
    is_list_public_pool_intent,
    parse_assistant_text,
    serialize_customer,
    serialize_lead,
    split_config_value,
    try_openai_assistant,
    utcnow,
    write_audit,
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

    llm_result = await try_openai_assistant(message)
    parsed = parse_assistant_text(message)
    if llm_result:
        parsed = {**parsed, **llm_result}
        llm_kind = str(llm_result.get("kind", "")).strip()
    else:
        llm_kind = ""

    if llm_kind == "create_lead" or is_create_lead_intent(message):
        skill_result = execute_lead_creation_skill(
            session,
            current_user,
            {
                "company_name": parsed.get("company_name", ""),
                "organization_code": parsed.get("organization_code", ""),
                "region": parsed.get("region", ""),
                "source": parsed.get("source", ""),
                "owner_id": None,
                "notes": "由智能助手创建",
                "contacts": parsed.get("contacts", []),
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

    if llm_kind == "list_public_pool" or is_list_public_pool_intent(message):
        leads = session.exec(select(Lead).where(Lead.is_public == True).order_by(Lead.updated_at.desc())).all()  # noqa: E712
        return {
            "message": f"当前公共线索池共有 {len(leads)} 条线索。",
            "result_kind": "lead_list",
            "data": {"leads": [serialize_lead(session, item) for item in leads[:8]]},
        }

    if llm_kind == "list_customers" or is_list_customers_intent(message):
        statement = select(Customer)
        if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
            statement = statement.where(Customer.owner_id == current_user.id)
        customers = session.exec(statement.order_by(Customer.updated_at.desc())).all()
        return {
            "message": f"共查询到 {len(customers)} 位客户。",
            "result_kind": "customer_list",
            "data": {"customers": [serialize_customer(session, item) for item in customers[:8]]},
        }

    if llm_kind == "list_leads" or is_list_leads_intent(message):
        statement = select(Lead).where(Lead.is_public == False)  # noqa: E712
        if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
            statement = statement.where(Lead.owner_id == current_user.id)
        leads = session.exec(statement.order_by(Lead.updated_at.desc())).all()
        return {
            "message": f"共查询到 {len(leads)} 条线索。",
            "result_kind": "lead_list",
            "data": {"leads": [serialize_lead(session, item) for item in leads[:8]]},
        }

    if llm_kind == "convert_lead" or is_convert_lead_intent(message):
        lead_id = parsed["target_id"]
        if not lead_id:
            return {
                "message": "请告诉我具体要转化哪一条线索，比如：转客户 3。",
                "result_kind": "message",
                "data": {},
            }
        lead = get_lead_or_404(session, lead_id)
        return {
            "message": f"准备将线索 {lead.id} 转成客户，请点击确认执行。",
            "result_kind": "draft_action",
            "data": {
                "lead": serialize_lead(session, lead),
                "draft_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}},
            },
        }

    if "跟进方式" in message or "配置" in message:
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
        "message": "我已经理解到这是第一期业务，但当前只支持创建线索、查线索、查公共线索池、查客户和发起转客户。",
        "result_kind": "message",
        "data": {},
    }
