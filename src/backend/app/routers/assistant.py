from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.ai_monitor import build_ai_session_id, record_ai_assistant_run
from app.core.database import get_session
from app.core.deps import get_current_user
from app.lead_domain import convert_lead, ensure_lead_access, get_lead_or_404, is_converted_lead, serialize_lead
from app.models import Customer, Lead, ROLE_ADMIN, ROLE_MANAGER, User
from app.schemas import AssistantRequest
from app.skills.lead_creation import execute_lead_creation_skill, get_lead_creation_context, raise_for_invalid_skill_result
from app.services import (
    DEFAULT_ASSISTANT_CLARIFY_REPLY,
    build_usage_meta,
    build_assistant_fallback_result,
    extract_customer_search_keyword,
    has_meaningful_lead_slots,
    is_convert_lead_intent,
    is_show_config_intent,
    matches_customer_search,
    matches_lead_search,
    merge_assistant_slots,
    normalize_usage_meta,
    parse_assistant_text,
    get_config_values,
    resolve_query_route,
    serialize_customer,
    split_config_value,
    try_openai_assistant,
)

router = APIRouter()


def _build_assistant_response(
    *,
    message: str,
    result_kind: str,
    data: dict,
    usage_meta: dict[str, object] | None,
    final_intent: str = "",
) -> dict:
    meta = normalize_usage_meta(usage_meta)
    meta["result_kind"] = result_kind
    meta["final_intent"] = final_intent.strip()
    return {
        "message": message,
        "result_kind": result_kind,
        "data": data,
        "usage_meta": meta,
    }


def _unwrap_assistant_route_result(payload: object) -> tuple[dict | None, dict[str, object], dict | None]:
    if isinstance(payload, dict) and ("result" in payload or "usage_meta" in payload or "error_meta" in payload):
        result = payload.get("result")
        usage_meta = normalize_usage_meta(payload.get("usage_meta"))
        error_meta = payload.get("error_meta") if isinstance(payload.get("error_meta"), dict) else None
        return result if isinstance(result, dict) else None, usage_meta, error_meta

    if isinstance(payload, dict):
        usage_meta = build_usage_meta()
        usage_meta["route_source"] = "openai_direct"
        return payload, usage_meta, None

    return None, build_usage_meta(), None


def _build_page_context_label(current_lead_id: int | None) -> str:
    return f"Lead#{current_lead_id}" if current_lead_id else ""


def _derive_run_result(result_kind: str) -> str:
    return "待确认" if result_kind == "draft_action" else "成功"


def _recorded_response(
    *,
    session: Session,
    actor: User,
    session_id: str,
    input_text: str,
    page_context: str,
    message: str,
    result_kind: str,
    data: dict,
    usage_meta: dict[str, object] | None,
    final_intent: str = "",
    action_type: str = "",
    target_type: str = "",
    target_id: str = "",
    target_label: str = "",
    confirm_required: bool = False,
    confirm_status: str = "not_required",
    write_applied: bool = False,
    result: str | None = None,
    write_effects: list[dict[str, object]] | None = None,
) -> dict:
    response = _build_assistant_response(
        message=message,
        result_kind=result_kind,
        data=data,
        usage_meta=usage_meta,
        final_intent=final_intent,
    )
    record_ai_assistant_run(
        session,
        actor=actor,
        session_id=session_id,
        input_text=input_text,
        assistant_message=message,
        result_kind=result_kind,
        usage_meta=response["usage_meta"],
        page_context=page_context,
        action_type=action_type or final_intent or str(response["usage_meta"].get("final_intent") or ""),
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        confirm_required=confirm_required,
        confirm_status=confirm_status,
        write_applied=write_applied,
        result=result or _derive_run_result(result_kind),
        write_effects=write_effects,
    )
    session.commit()
    return response


def _query_customers(session: Session, current_user: User, search_keyword: str = "", limit: int = 8) -> dict:
    statement = select(Customer)
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        statement = statement.where(Customer.owner_id == current_user.id)
    customers = session.exec(statement.order_by(Customer.updated_at.desc())).all()
    serialized = [serialize_customer(session, item) for item in customers]
    if search_keyword:
        serialized = [item for item in serialized if matches_customer_search(item, search_keyword)]
    return {
        "items": serialized[:limit],
        "total": len(serialized),
        "filters": {"search": search_keyword},
    }


def _query_owned_leads(
    session: Session,
    current_user: User,
    search_keyword: str = "",
    status_filter: str = "",
    region_filter: str = "",
    limit: int = 8,
) -> dict:
    statement = select(Lead).where(Lead.is_public == False)  # noqa: E712
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        statement = statement.where(Lead.owner_id == current_user.id)
    leads = [item for item in session.exec(statement.order_by(Lead.updated_at.desc())).all() if not is_converted_lead(item)]
    serialized = [serialize_lead(session, item) for item in leads]
    if search_keyword:
        serialized = [item for item in serialized if matches_lead_search(item, search_keyword)]
    if status_filter:
        serialized = [item for item in serialized if item["status"] == status_filter]
    if region_filter:
        serialized = [item for item in serialized if item["region"] == region_filter]
    return {
        "items": serialized[:limit],
        "total": len(serialized),
        "filters": {
            "search": search_keyword,
            "status": status_filter,
            "region": region_filter,
        },
    }


def _query_public_pool(
    session: Session,
    search_keyword: str = "",
    status_filter: str = "",
    region_filter: str = "",
    limit: int = 8,
) -> dict:
    leads = [
        item
        for item in session.exec(select(Lead).where(Lead.is_public == True).order_by(Lead.updated_at.desc())).all()  # noqa: E712
        if not is_converted_lead(item)
    ]
    serialized = [serialize_lead(session, item) for item in leads]
    if search_keyword:
        serialized = [item for item in serialized if matches_lead_search(item, search_keyword)]
    if status_filter:
        serialized = [item for item in serialized if item["status"] == status_filter]
    if region_filter:
        serialized = [item for item in serialized if item["region"] == region_filter]
    return {
        "items": serialized[:limit],
        "total": len(serialized),
        "filters": {
            "search": search_keyword,
            "status": status_filter,
            "region": region_filter,
        },
    }


def _global_search_message(search_keyword: str, counts: dict[str, int]) -> str:
    if counts["customers"] == 0 and counts["leads"] == 0 and counts["public_pool_leads"] == 0:
        return f"客户、我的线索、公共池里都没有查到“{search_keyword}”。"
    return (
        f"查到这些结果：客户 {counts['customers']} 个，"
        f"我的线索 {counts['leads']} 条，公共池 {counts['public_pool_leads']} 条。"
    )


@router.post("/assistant/message")
async def assistant_message(
    body: AssistantRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    request_context = body.context if isinstance(body.context, dict) else {}
    current_lead_id = request_context.get("lead_id")
    try:
        current_lead_id = int(current_lead_id) if current_lead_id is not None else None
    except (TypeError, ValueError):
        current_lead_id = None

    ai_session_id = build_ai_session_id(current_user, body.session_id)
    page_context_label = _build_page_context_label(current_lead_id)
    raw_input_text = body.message.strip() or (f"确认执行 {body.confirm_action.kind}" if body.confirm_action else "")

    try:
        if body.confirm_action:
            usage_meta = build_usage_meta()
            usage_meta["route_source"] = "confirm_action"
            if body.confirm_action.kind == "convert_lead":
                lead_id = int(body.confirm_action.payload.get("lead_id", 0))
                lead = get_lead_or_404(session, lead_id)
                if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN} and lead.owner_id != current_user.id:
                    raise HTTPException(status_code=403, detail="无权转化该线索")
                customer = convert_lead(session, current_user, lead, source="智能助手")
                session.add(lead)
                session.commit()
                session.refresh(customer)
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=ai_session_id,
                    input_text=f"确认执行 {body.confirm_action.kind}",
                    page_context=page_context_label or f"Lead#{lead.id}",
                    message=f"线索 {lead.id} 已成功转成客户 {customer.customer_name}",
                    result_kind="customer_created",
                    data={"customer": serialize_customer(session, customer), "lead": serialize_lead(session, lead)},
                    usage_meta=usage_meta,
                    final_intent="convert_lead",
                    action_type="convert_lead",
                    target_type="客户",
                    target_id=str(customer.id),
                    target_label=f"Customer#{customer.id} {customer.customer_name}",
                    confirm_required=True,
                    confirm_status="confirmed",
                    write_applied=True,
                    write_effects=[
                        {
                            "object_type": "Lead",
                            "object_id": str(lead.id),
                            "object_label": lead.company_name,
                            "change_type": "update",
                            "before_summary": "converted_customer_id 为空",
                            "after_summary": f"converted_customer_id = {customer.id}",
                        },
                        {
                            "object_type": "Customer",
                            "object_id": str(customer.id),
                            "object_label": customer.customer_name,
                            "change_type": "create",
                            "before_summary": "不存在",
                            "after_summary": "已创建",
                        },
                    ],
                )
            raise HTTPException(status_code=400, detail="暂不支持该确认动作")

        message = body.message.strip()
        if not message:
            usage_meta = build_usage_meta()
            usage_meta["route_source"] = "empty_message"
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text="",
                page_context=page_context_label,
                message="你可以让我创建线索、查询线索、查看公共线索池、查询客户，或者发起转客户。",
                result_kind="message",
                data={},
                usage_meta=usage_meta,
                final_intent="message",
                action_type="message",
            )

        if is_show_config_intent(message):
            usage_meta = build_usage_meta()
            usage_meta["route_source"] = "local_rule"
            usage_meta["final_intent"] = "show_config"
            usage_meta["llm_intent"] = "show_config"
            config = get_config_values(session)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message="这是当前可用的基础配置。",
                result_kind="message",
                data={
                    "lead_sources": split_config_value(config.get("lead_sources", "")),
                    "followup_methods": split_config_value(config.get("followup_methods", "")),
                },
                usage_meta=usage_meta,
                final_intent="show_config",
                action_type="show_config",
            )

        if current_lead_id is not None and is_convert_lead_intent(message):
            usage_meta = build_usage_meta()
            usage_meta["route_source"] = "fallback_after_unknown"
            usage_meta["fallback_used"] = True
            usage_meta["final_intent"] = "convert_lead"
            usage_meta["llm_intent"] = "unknown"
            lead = get_lead_or_404(session, current_lead_id)
            if is_converted_lead(lead):
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=ai_session_id,
                    input_text=message,
                    page_context=page_context_label or f"Lead#{lead.id}",
                    message="这条线索已经转为客户，不能重复转客户。",
                    result_kind="message",
                    data={"status": "failed", "reason": "already_converted", "lead": serialize_lead(session, lead)},
                    usage_meta=usage_meta,
                    final_intent="convert_lead",
                    action_type="convert_lead",
                    target_type="绾跨储",
                    target_id=str(lead.id),
                    target_label=f"Lead#{lead.id} {lead.company_name}",
                    result="澶辫触",
                )
            if lead.is_public and current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
                raise HTTPException(status_code=403, detail="公共线索仅支持领取后再发起转客户")
            if not lead.is_public:
                ensure_lead_access(current_user, lead)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label or f"Lead#{lead.id}",
                message=f"准备将线索 {lead.id} 转成客户，请点击确认执行。",
                result_kind="draft_action",
                data={
                    "lead": serialize_lead(session, lead),
                    "draft_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}},
                },
                usage_meta=usage_meta,
                final_intent="convert_lead",
                action_type="draft_convert_lead",
                target_type="线索",
                target_id=str(lead.id),
                target_label=f"Lead#{lead.id} {lead.company_name}",
                confirm_required=True,
                confirm_status="pending",
                result="待确认",
            )

        lead_creation_context = get_lead_creation_context(session, current_user.id, body.session_id)
        model_context = {
            "user": {
                "id": current_user.id,
                "name": current_user.name,
                "role": current_user.role,
            },
            "page_context": {
                "lead_id": current_lead_id,
            },
            "current_lead_creation": lead_creation_context,
            "allowed_intents": [
                "create_lead",
                "list_leads",
                "list_public_pool",
                "list_customers",
                "global_search",
                "convert_lead",
                "show_config",
                "chat",
                "unknown",
            ],
        }
        routed_raw = await try_openai_assistant(message, context=model_context)
        routed, usage_meta, error_meta = _unwrap_assistant_route_result(routed_raw)
        if routed is None:
            routed = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)
            usage_meta["fallback_used"] = True
            error_type = str((error_meta or {}).get("type") or "").strip()
            usage_meta["route_source"] = "llm_skipped_no_api_key" if error_type == "MissingApiKey" else "fallback_after_error"
        elif not usage_meta.get("route_source"):
            usage_meta["route_source"] = "openai_direct"

        intent = str(routed.get("intent", "unknown")).strip()
        next_action = str(routed.get("next_action", "reply")).strip()
        reply = str(routed.get("reply", "")).strip()
        slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}
        parsed_slots = parse_assistant_text(message)
        current_draft = lead_creation_context.get("draft", {}) if lead_creation_context else {}
        if not usage_meta.get("llm_intent"):
            usage_meta["llm_intent"] = intent

        is_lead_draft_update = bool(lead_creation_context and has_meaningful_lead_slots(parsed_slots))
        query_route = None if is_lead_draft_update else resolve_query_route(message)
        if query_route:
            route_intent = str(query_route.get("intent", "")).strip()
            if route_intent and intent != route_intent:
                routed = {
                    "intent": route_intent,
                    "reply": "",
                    "confidence": max(float(routed.get("confidence", 0) or 0), 0.55),
                    "slots": {},
                    "next_action": "call_skill",
                    "target_id": None,
                }
                usage_meta["fallback_used"] = True
                usage_meta["route_source"] = "fallback_after_unknown"
                intent = route_intent
                next_action = "call_skill"
                reply = ""
            slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}
            if query_route.get("search") and not str(slots.get("company_name", "")).strip():
                slots["company_name"] = str(query_route.get("search") or "").strip()
            if query_route.get("status") and not str(slots.get("status", "")).strip():
                slots["status"] = str(query_route.get("status") or "").strip()
            if query_route.get("region") and not str(slots.get("region", "")).strip():
                slots["region"] = str(query_route.get("region") or "").strip()
            routed["slots"] = slots

        if intent == "create_lead":
            slots = merge_assistant_slots(slots, merge_assistant_slots(parsed_slots, current_draft))
            routed["slots"] = slots
        elif intent in {"list_leads", "list_public_pool", "global_search"}:
            slots = merge_assistant_slots(slots, parsed_slots)
            routed["slots"] = slots
        elif intent in {"unknown", "chat"}:
            fallback = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)
            fallback_intent = str(fallback.get("intent", "unknown")).strip()
            should_force_convert = intent == "chat" and current_lead_id is not None and is_convert_lead_intent(message)
            if fallback_intent != "unknown" and (intent == "unknown" or should_force_convert):
                routed = fallback
                usage_meta["fallback_used"] = True
                usage_meta["route_source"] = "fallback_after_unknown"
                intent = str(routed.get("intent", "unknown")).strip()
                next_action = str(routed.get("next_action", "reply")).strip()
                reply = str(routed.get("reply", "")).strip()
                slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}
            elif lead_creation_context and has_meaningful_lead_slots(merge_assistant_slots(parsed_slots, current_draft)):
                routed = build_assistant_fallback_result(message, current_lead_creation=lead_creation_context)
                usage_meta["fallback_used"] = True
                usage_meta["route_source"] = "fallback_after_unknown"
                intent = str(routed.get("intent", "unknown")).strip()
                next_action = str(routed.get("next_action", "reply")).strip()
                reply = str(routed.get("reply", "")).strip()
                slots = routed.get("slots") if isinstance(routed.get("slots"), dict) else {}

        if current_lead_id is not None and is_convert_lead_intent(message) and intent == "convert_lead":
            routed["target_id"] = current_lead_id
            if next_action in {"reply", "clarify"}:
                next_action = "confirm"
                reply = ""

        query_intents = {"list_customers", "list_leads", "list_public_pool", "global_search"}
        if intent != "create_lead" and intent not in query_intents and next_action in {"reply", "clarify"} and reply:
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message=reply,
                result_kind="message",
                data={
                    "intent": intent,
                    "confidence": routed.get("confidence", 0),
                    "session_id": lead_creation_context["session_id"] if lead_creation_context else body.session_id,
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type=intent or "message",
            )

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
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=build_ai_session_id(current_user, skill_result["session_id"] or body.session_id),
                    input_text=message,
                    page_context=page_context_label,
                    message=f"创建线索还缺少必要信息，请至少提供：{'、'.join(skill_result['missing_fields'])}。",
                    result_kind="message",
                    data={
                        "status": skill_result["status"],
                        "missing_fields": skill_result["missing_fields"],
                        "draft": skill_result["draft"],
                        "session_id": skill_result["session_id"],
                    },
                    usage_meta=usage_meta,
                    final_intent=intent,
                    action_type="create_lead",
                )

            if skill_result["status"] == "duplicate_found":
                duplicate_lead = skill_result["duplicate_lead"]
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=build_ai_session_id(current_user, skill_result["session_id"] or body.session_id),
                    input_text=message,
                    page_context=page_context_label,
                    message=(
                        f"我发现这条线索可能已经存在。"
                        f"重复线索编号是 {duplicate_lead['id']}，"
                        f"公司名称是 {duplicate_lead['company_name']}，"
                        f"主联系人是 {duplicate_lead['primary_contact_name'] or '未填写'}，"
                        f"手机号是 {duplicate_lead['primary_contact_phone'] or '未填写'}。"
                        f"你可以先查看已有线索，再决定是否放弃本次创建。"
                    ),
                    result_kind="message",
                    data={
                        "status": skill_result["status"],
                        "duplicate_lead": duplicate_lead,
                        "draft": skill_result["draft"],
                        "session_id": skill_result["session_id"],
                        "available_actions": skill_result["available_actions"],
                    },
                    usage_meta=usage_meta,
                    final_intent=intent,
                    action_type="create_lead",
                    target_type="线索",
                    target_id=str(duplicate_lead["id"]),
                    target_label=f"Lead#{duplicate_lead['id']} {duplicate_lead['company_name']}",
                    result="失败",
                )

            lead = skill_result["lead"]
            lead_contacts = lead.get("contacts", []) if isinstance(lead, dict) else []
            primary_contact = lead_contacts[0] if lead_contacts else {}
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=build_ai_session_id(current_user, skill_result["session_id"] or body.session_id),
                input_text=message,
                page_context=page_context_label,
                message=f"已为你创建线索：{lead['company_name']}",
                result_kind="lead_created",
                data={
                    "status": skill_result["status"],
                    "lead": lead,
                    "session_id": skill_result["session_id"],
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="create_lead",
                target_type="线索",
                target_id=str(lead["id"]),
                target_label=f"Lead#{lead['id']} {lead['company_name']}",
                write_applied=True,
                write_effects=[
                    {
                        "object_type": "Lead",
                        "object_id": str(lead["id"]),
                        "object_label": lead["company_name"],
                        "change_type": "create",
                        "before_summary": "不存在",
                        "after_summary": "已创建",
                    },
                    {
                        "object_type": "Contact",
                        "object_id": str(primary_contact.get("id", "")),
                        "object_label": str(primary_contact.get("name", "")),
                        "change_type": "create",
                        "before_summary": "不存在",
                        "after_summary": "已创建为主联系人",
                    },
                ],
            )

        if intent == "list_public_pool":
            search_keyword = str(slots.get("company_name", "")).strip()
            status_filter = str(slots.get("status", "")).strip()
            region_filter = str(slots.get("region", "")).strip()
            query_result = _query_public_pool(session, search_keyword, status_filter, region_filter)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message=f"当前公共线索池共有 {query_result['total']} 条线索。",
                result_kind="lead_list",
                data={
                    "leads": query_result["items"],
                    "filters": query_result["filters"],
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="list_public_pool",
            )

        if intent == "list_customers":
            search_keyword = str(slots.get("company_name", "")).strip()
            if not search_keyword:
                contacts = slots.get("contacts", [])
                if isinstance(contacts, list) and contacts:
                    first_contact = contacts[0] if isinstance(contacts[0], dict) else {}
                    search_keyword = str(first_contact.get("name", "") or first_contact.get("phone", "")).strip()
            inferred_search_keyword = extract_customer_search_keyword(message)
            if not search_keyword and inferred_search_keyword:
                search_keyword = inferred_search_keyword
            query_result = _query_customers(session, current_user, search_keyword)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message=f"共查询到 {query_result['total']} 位客户。",
                result_kind="customer_list",
                data={
                    "customers": query_result["items"],
                    "filters": query_result["filters"],
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="list_customers",
            )

        if intent == "list_leads":
            search_keyword = str(slots.get("company_name", "")).strip()
            status_filter = str(slots.get("status", "")).strip()
            region_filter = str(slots.get("region", "")).strip()
            query_result = _query_owned_leads(session, current_user, search_keyword, status_filter, region_filter)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message=f"共查询到 {query_result['total']} 条线索。",
                result_kind="lead_list",
                data={
                    "leads": query_result["items"],
                    "filters": query_result["filters"],
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="list_leads",
            )

        if intent == "global_search":
            search_keyword = str(slots.get("company_name", "")).strip()
            if not search_keyword:
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=ai_session_id,
                    input_text=message,
                    page_context=page_context_label,
                    message="请提供要查询的公司、联系人或手机号。",
                    result_kind="message",
                    data={"intent": intent},
                    usage_meta=usage_meta,
                    final_intent=intent,
                    action_type="global_search",
                )
            customer_result = _query_customers(session, current_user, search_keyword, limit=5)
            lead_result = _query_owned_leads(session, current_user, search_keyword, limit=5)
            public_pool_result = _query_public_pool(session, search_keyword, limit=5)
            counts = {
                "customers": customer_result["total"],
                "leads": lead_result["total"],
                "public_pool_leads": public_pool_result["total"],
            }
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message=_global_search_message(search_keyword, counts),
                result_kind="global_search",
                data={
                    "customers": customer_result["items"],
                    "leads": lead_result["items"],
                    "public_pool_leads": public_pool_result["items"],
                    "counts": counts,
                    "filters": {"search": search_keyword},
                },
                usage_meta=usage_meta,
                final_intent="global_search",
                action_type="global_search",
            )

        if intent == "convert_lead":
            lead_id = routed.get("target_id") or current_lead_id
            if not lead_id:
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=ai_session_id,
                    input_text=message,
                    page_context=page_context_label,
                    message="请告诉我具体要转化哪一条线索，比如：转客户 3。",
                    result_kind="message",
                    data={},
                    usage_meta=usage_meta,
                    final_intent=intent,
                    action_type="convert_lead",
                    result="失败",
                )
            lead = get_lead_or_404(session, lead_id)
            if is_converted_lead(lead):
                return _recorded_response(
                    session=session,
                    actor=current_user,
                    session_id=ai_session_id,
                    input_text=message,
                    page_context=page_context_label or f"Lead#{lead.id}",
                    message="这条线索已经转为客户，不能重复转客户。",
                    result_kind="message",
                    data={"status": "failed", "reason": "already_converted", "lead": serialize_lead(session, lead)},
                    usage_meta=usage_meta,
                    final_intent="convert_lead",
                    action_type="convert_lead",
                    target_type="绾跨储",
                    target_id=str(lead.id),
                    target_label=f"Lead#{lead.id} {lead.company_name}",
                    result="澶辫触",
                )
            if lead.is_public and current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
                raise HTTPException(status_code=403, detail="公共线索仅支持领取后再发起转客户")
            if not lead.is_public:
                ensure_lead_access(current_user, lead)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label or f"Lead#{lead.id}",
                message=f"准备将线索 {lead.id} 转成客户，请点击确认执行。",
                result_kind="draft_action",
                data={
                    "lead": serialize_lead(session, lead),
                    "draft_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}},
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="draft_convert_lead",
                target_type="线索",
                target_id=str(lead.id),
                target_label=f"Lead#{lead.id} {lead.company_name}",
                confirm_required=True,
                confirm_status="pending",
                result="待确认",
            )

        if intent == "show_config":
            config = get_config_values(session)
            return _recorded_response(
                session=session,
                actor=current_user,
                session_id=ai_session_id,
                input_text=message,
                page_context=page_context_label,
                message="这是当前的基础配置。",
                result_kind="message",
                data={
                    "lead_sources": split_config_value(config.get("lead_sources", "")),
                    "followup_methods": split_config_value(config.get("followup_methods", "")),
                },
                usage_meta=usage_meta,
                final_intent=intent,
                action_type="show_config",
            )

        return _recorded_response(
            session=session,
            actor=current_user,
            session_id=ai_session_id,
            input_text=message,
            page_context=page_context_label,
            message=reply or DEFAULT_ASSISTANT_CLARIFY_REPLY,
            result_kind="message",
            data={"intent": intent, "confidence": routed.get("confidence", 0)},
            usage_meta=usage_meta,
            final_intent=intent,
            action_type=intent or "message",
        )
    except HTTPException as exc:
        usage_meta = build_usage_meta()
        usage_meta["route_source"] = "fallback_after_error"
        usage_meta["fallback_used"] = True
        usage_meta["final_intent"] = "error"
        usage_meta["llm_intent"] = "error"
        response = _build_assistant_response(
            message=str(exc.detail),
            result_kind="message",
            data={"status": "failed", "error_type": f"HTTP_{exc.status_code}", "detail": str(exc.detail)},
            usage_meta=usage_meta,
            final_intent="error",
        )
        record_ai_assistant_run(
            session,
            actor=current_user,
            session_id=ai_session_id,
            input_text=raw_input_text,
            assistant_message=str(exc.detail),
            result_kind="message",
            usage_meta=response["usage_meta"],
            page_context=page_context_label,
            action_type="error",
            result="失败",
            error_type=f"HTTP_{exc.status_code}",
            error_message=str(exc.detail),
        )
        session.commit()
        return response
