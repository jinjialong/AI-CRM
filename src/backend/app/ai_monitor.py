import re
from collections import Counter
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlmodel import Session, select

from app.models import AiAssistantRunLog, AiAssistantWriteEffect, User, utcnow


SUCCESS_RESULTS = {"成功", "待确认"}
WRITE_ACTIONS = {"create_lead", "convert_lead"}
HIGH_RISK_ACTIONS = {"convert_lead", "draft_convert_lead", "delete_lead", "delete_customer"}
MODEL_RECOVERY_MODES = {"model_unknown_recovery", "model_error_recovery", "local_only"}


def mask_sensitive_text(value: str, limit: int = 160) -> str:
    text = str(value or "").strip()
    text = re.sub(r"(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)", r"\1****\2", text)
    return text[:limit]


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _safe_bool(value: Any) -> bool:
    return bool(value)


def normalize_route_source(value: Any, *, llm_called: bool = False, fallback_used: bool = False, action_type: str = "") -> str:
    text = str(value or "").strip()
    if text:
        return text
    if action_type == "error":
        return "fallback_after_error"
    if fallback_used:
        return "fallback_after_unknown"
    if llm_called:
        return "openai_direct"
    return "llm_skipped_no_api_key"


def _date_start(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.min)


def _date_end(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.max)


def build_ai_session_id(actor: User, session_id: int | str | None = None) -> str:
    if session_id:
        return f"S-{session_id}"
    return f"S-AUTO-{actor.id}-{int(utcnow().timestamp() * 1000)}"


def next_turn_no(session: Session, session_id: str) -> int:
    logs = session.exec(select(AiAssistantRunLog).where(AiAssistantRunLog.session_id == session_id)).all()
    if not logs:
        return 1
    return max(item.turn_no for item in logs) + 1


def infer_risk_level(action_type: str, write_applied: bool, fallback_used: bool, confirm_required: bool) -> str:
    if action_type in HIGH_RISK_ACTIONS or write_applied:
        return "高"
    if fallback_used or confirm_required:
        return "中"
    return "低"


def record_ai_assistant_run(
    session: Session,
    *,
    actor: User,
    session_id: str,
    input_text: str,
    assistant_message: str,
    result_kind: str,
    usage_meta: dict[str, Any] | None,
    page_context: str = "",
    action_type: str = "",
    target_type: str = "",
    target_id: str = "",
    target_label: str = "",
    confirm_required: bool = False,
    confirm_status: str = "not_required",
    write_applied: bool = False,
    result: str = "成功",
    error_type: str = "",
    error_message: str = "",
    write_effects: list[dict[str, Any]] | None = None,
) -> AiAssistantRunLog:
    meta = usage_meta or {}
    action = action_type or str(meta.get("final_intent") or meta.get("llm_intent") or result_kind or "")
    fallback_used_value = _safe_bool(meta.get("fallback_used"))
    llm_called_value = _safe_bool(meta.get("llm_called"))
    run_log = AiAssistantRunLog(
        session_id=session_id,
        turn_no=next_turn_no(session, session_id),
        user_id=actor.id,
        user_name=actor.name,
        user_role=actor.role,
        entrypoint="/assistant/message",
        page_context=page_context,
        input_excerpt=mask_sensitive_text(input_text),
        assistant_message_excerpt=mask_sensitive_text(assistant_message),
        provider=str(meta.get("provider") or "openai"),
        model=str(meta.get("model") or ""),
        prompt_tokens=_safe_int(meta.get("prompt_tokens")),
        completion_tokens=_safe_int(meta.get("completion_tokens")),
        total_tokens=_safe_int(meta.get("total_tokens")),
        latency_ms=_safe_int(meta.get("latency_ms")),
        llm_called=llm_called_value,
        route_source=normalize_route_source(
            meta.get("route_source"),
            llm_called=llm_called_value,
            fallback_used=fallback_used_value,
            action_type=action,
        ),
        fallback_used=fallback_used_value,
        llm_intent=str(meta.get("llm_intent") or ""),
        final_intent=str(meta.get("final_intent") or action),
        result_kind=result_kind,
        action_type=action,
        target_type=target_type,
        target_id=str(target_id or ""),
        target_label=target_label,
        confirm_required=confirm_required,
        confirm_status=confirm_status,
        write_applied=write_applied,
        risk_level=infer_risk_level(action, write_applied, fallback_used_value, confirm_required),
        result=result,
        error_type=error_type,
        error_message=mask_sensitive_text(error_message),
    )
    session.add(run_log)
    session.flush()

    for effect in write_effects or []:
        session.add(
            AiAssistantWriteEffect(
                run_log_id=run_log.id,
                object_type=str(effect.get("object_type") or ""),
                object_id=str(effect.get("object_id") or ""),
                object_label=str(effect.get("object_label") or ""),
                change_type=str(effect.get("change_type") or ""),
                before_summary=str(effect.get("before_summary") or ""),
                after_summary=str(effect.get("after_summary") or ""),
                audit_written=bool(effect.get("audit_written", True)),
            )
        )
    return run_log


def query_run_logs(
    session: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    capability: str = "",
    model: str = "",
    result_kind: str = "",
    fallback_used: str = "",
    action_type: str = "",
    risk_level: str = "",
    result: str = "",
    search: str = "",
) -> list[AiAssistantRunLog]:
    statement = select(AiAssistantRunLog)
    start = _date_start(date_from)
    end = _date_end(date_to)
    if start:
        statement = statement.where(AiAssistantRunLog.created_at >= start)
    if end:
        statement = statement.where(AiAssistantRunLog.created_at <= end)
    if capability:
        statement = statement.where(AiAssistantRunLog.final_intent == capability)
    if model:
        statement = statement.where(AiAssistantRunLog.model == model)
    if result_kind:
        statement = statement.where(AiAssistantRunLog.result_kind == result_kind)
    if fallback_used in {"true", "false"}:
        statement = statement.where(AiAssistantRunLog.fallback_used == (fallback_used == "true"))
    if action_type:
        statement = statement.where(AiAssistantRunLog.action_type == action_type)
    if risk_level:
        statement = statement.where(AiAssistantRunLog.risk_level == risk_level)
    if result:
        statement = statement.where(AiAssistantRunLog.result == result)
    logs = session.exec(statement.order_by(AiAssistantRunLog.created_at.desc())).all()
    keyword = search.strip().lower()
    if not keyword:
        return logs
    return [
        item
        for item in logs
        if keyword in item.session_id.lower()
        or keyword in item.input_excerpt.lower()
        or keyword in item.target_label.lower()
        or keyword in item.target_id.lower()
    ]


def token_summary(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    total = len(logs)
    if not total:
        return {
            "total_tokens": 0,
            "total_request_count": 0,
            "avg_total_tokens": 0,
            "avg_session_tokens": 0,
            "avg_latency_ms": 0,
            "fallback_rate": 0,
            "model_recovery_rate": 0,
            "pass_rate": 0,
            "avg_prompt_tokens": 0,
            "avg_completion_tokens": 0,
        }
    success_count = sum(1 for item in logs if item.result in SUCCESS_RESULTS and not item.error_type)
    session_totals: dict[str, int] = {}
    for item in logs:
        session_totals[item.session_id] = session_totals.get(item.session_id, 0) + item.total_tokens
    model_recovery_count = sum(1 for item in logs if classify_processing_mode(item) in MODEL_RECOVERY_MODES)
    return {
        "total_tokens": sum(item.total_tokens for item in logs),
        "total_request_count": total,
        "avg_total_tokens": round(sum(item.total_tokens for item in logs) / total, 2),
        "avg_session_tokens": round(sum(session_totals.values()) / len(session_totals), 2) if session_totals else 0,
        "avg_latency_ms": round(sum(item.latency_ms for item in logs) / total, 2),
        "fallback_rate": round(sum(1 for item in logs if item.fallback_used) / total * 100, 2),
        "model_recovery_rate": round(model_recovery_count / total * 100, 2),
        "pass_rate": round(success_count / total * 100, 2),
        "avg_prompt_tokens": round(sum(item.prompt_tokens for item in logs) / total, 2),
        "avg_completion_tokens": round(sum(item.completion_tokens for item in logs) / total, 2),
    }


def token_trend(logs: list[AiAssistantRunLog], bucket: str = "day") -> dict[str, Any]:
    grouped: dict[str, list[AiAssistantRunLog]] = {}
    for item in logs:
        label = item.created_at.strftime("%m-%d %H:00") if bucket == "hour" else item.created_at.strftime("%m-%d")
        grouped.setdefault(label, []).append(item)
    points = []
    for label in sorted(grouped):
        items = grouped[label]
        count = len(items) or 1
        points.append(
            {
                "bucket_label": label,
                "total_tokens": sum(item.total_tokens for item in items),
                "prompt_tokens": sum(item.prompt_tokens for item in items),
                "completion_tokens": sum(item.completion_tokens for item in items),
                "avg_latency_ms": round(sum(item.latency_ms for item in items) / count, 2),
            }
        )
    return {"points": points}


def token_route_sources(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    total = len(logs)
    counts = Counter(
        normalize_route_source(
            item.route_source,
            llm_called=item.llm_called,
            fallback_used=item.fallback_used,
            action_type=item.action_type,
        )
        for item in logs
    )
    items = [
        {
            "route_source": route_source,
            "count": count,
            "rate": round(count / total * 100, 2) if total else 0,
        }
        for route_source, count in counts.most_common()
    ]
    return {"items": items, "total": total}


def classify_fallback_reason(item: AiAssistantRunLog) -> str:
    route_source = normalize_route_source(
        item.route_source,
        llm_called=item.llm_called,
        fallback_used=item.fallback_used,
        action_type=item.action_type,
    )
    if route_source == "fallback_after_error":
        return "model_error_recovery"
    if route_source == "llm_skipped_no_api_key":
        return "no_model_local_handling"
    if route_source == "fallback_after_unknown":
        if item.confirm_required or item.result_kind == "draft_action" or item.action_type in {"convert_lead", "draft_convert_lead"}:
            return "high_risk_guardrail"
        return "model_unknown_recovery"
    return "non_fallback"


def token_fallback_breakdown(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    fallback_logs = [item for item in logs if item.fallback_used]
    total = len(fallback_logs)
    counts = Counter(classify_fallback_reason(item) for item in fallback_logs)
    items = [
        {
            "reason": reason,
            "count": count,
            "rate_in_fallback": round(count / total * 100, 2) if total else 0,
        }
        for reason, count in counts.most_common()
        if reason != "non_fallback"
    ]
    return {"items": items, "total": total}


def classify_processing_mode(item: AiAssistantRunLog) -> str:
    route_source = normalize_route_source(
        item.route_source,
        llm_called=item.llm_called,
        fallback_used=item.fallback_used,
        action_type=item.action_type,
    )
    if item.confirm_status == "confirmed" or route_source == "confirm_action":
        return "confirmed_execution"
    if item.confirm_required and item.confirm_status == "pending":
        return "pending_confirm"
    if item.result_kind == "draft_action":
        return "pending_confirm"
    if route_source == "fallback_after_error":
        return "model_error_recovery"
    if route_source == "llm_skipped_no_api_key":
        return "local_only"
    if route_source == "fallback_after_unknown" or item.fallback_used:
        return "model_unknown_recovery"
    return "model_direct"


def token_processing_modes(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    total = len(logs)
    counts = Counter(classify_processing_mode(item) for item in logs)
    items = [
        {
            "processing_mode": mode,
            "count": count,
            "rate": round(count / total * 100, 2) if total else 0,
        }
        for mode, count in counts.most_common()
    ]
    return {"items": items, "total": total}


def token_capability_distribution(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    total_tokens = sum(item.total_tokens for item in logs)
    grouped: dict[str, dict[str, Any]] = {}
    for item in logs:
        capability = item.final_intent or item.action_type or "unknown"
        if capability not in grouped:
            grouped[capability] = {"capability": capability, "total_tokens": 0, "request_count": 0}
        grouped[capability]["total_tokens"] += item.total_tokens
        grouped[capability]["request_count"] += 1
    items = [
        {
            **item,
            "rate": round(item["total_tokens"] / total_tokens * 100, 2) if total_tokens else 0,
            "avg_total_tokens": round(item["total_tokens"] / item["request_count"], 2) if item["request_count"] else 0,
        }
        for item in grouped.values()
    ]
    items.sort(key=lambda item: item["total_tokens"], reverse=True)
    return {"items": items, "total_tokens": total_tokens}


def token_top_cost(logs: list[AiAssistantRunLog], limit: int = 5) -> dict[str, Any]:
    capability_distribution = token_capability_distribution(logs)["items"][:limit]
    top_cases = sorted(logs, key=lambda item: item.total_tokens, reverse=True)[:limit]
    session_totals: dict[str, dict[str, Any]] = {}
    for item in logs:
        if item.session_id not in session_totals:
            session_totals[item.session_id] = {
                "session_id": item.session_id,
                "capability": item.final_intent or item.action_type,
                "total_tokens": 0,
                "request_count": 0,
            }
        session_totals[item.session_id]["total_tokens"] += item.total_tokens
        session_totals[item.session_id]["request_count"] += 1
    top_sessions = sorted(session_totals.values(), key=lambda item: item["total_tokens"], reverse=True)[:limit]
    return {
        "top_capabilities": capability_distribution,
        "top_cases": [
            {
                "case_id": f"AI-{item.id}",
                "session_id": item.session_id,
                "capability": item.final_intent or item.action_type,
                "total_tokens": item.total_tokens,
                "latency_ms": item.latency_ms,
                "created_at": item.created_at,
            }
            for item in top_cases
        ],
        "top_sessions": top_sessions,
    }


def token_case_item(item: AiAssistantRunLog) -> dict[str, Any]:
    return {
        "case_id": f"AI-{item.id}",
        "capability": item.final_intent or item.action_type,
        "created_at": item.created_at,
        "model": item.model,
        "prompt_tokens": item.prompt_tokens,
        "completion_tokens": item.completion_tokens,
        "total_tokens": item.total_tokens,
        "latency_ms": item.latency_ms,
        "route_source": normalize_route_source(
            item.route_source,
            llm_called=item.llm_called,
            fallback_used=item.fallback_used,
            action_type=item.action_type,
        ),
        "result_kind": item.result_kind,
        "session_id": item.session_id,
        "user_name": item.user_name,
        "fallback_used": item.fallback_used,
        "processing_mode": classify_processing_mode(item),
        "llm_intent": item.llm_intent,
        "final_intent": item.final_intent,
    }


def paginate(items: list[Any], page: int = 1, page_size: int = 20) -> list[Any]:
    safe_page = max(page, 1)
    safe_size = max(min(page_size, 100), 1)
    start = (safe_page - 1) * safe_size
    return items[start : start + safe_size]


def token_session_detail(session: Session, session_id: str) -> dict[str, Any]:
    turns = session.exec(
        select(AiAssistantRunLog)
        .where(AiAssistantRunLog.session_id == session_id)
        .order_by(AiAssistantRunLog.turn_no.asc(), AiAssistantRunLog.created_at.asc())
    ).all()
    if not turns:
        return {
            "session_id": session_id,
            "user_name": "",
            "capability": "",
            "model": "",
            "result_kind": "",
            "route_source": "",
            "fallback_used": False,
            "processing_mode": "",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "latency_ms": 0,
            "llm_intent": "",
            "final_intent": "",
            "risk_notes": [],
            "linked_action_ids": [],
            "linked_actions": [],
            "turns": [],
        }
    latest = turns[-1]
    risk_notes = []
    if any(item.fallback_used for item in turns):
        risk_notes.append("该会话存在兜底执行，请关注模型意图识别稳定性")
    if max(item.total_tokens for item in turns) > 1800:
        risk_notes.append("该会话存在高 Token 消耗轮次")
    return {
        "session_id": session_id,
        "user_name": latest.user_name,
        "capability": latest.final_intent or latest.action_type,
        "model": latest.model,
        "result_kind": latest.result_kind,
        "route_source": normalize_route_source(
            latest.route_source,
            llm_called=latest.llm_called,
            fallback_used=latest.fallback_used,
            action_type=latest.action_type,
        ),
        "fallback_used": any(item.fallback_used for item in turns),
        "processing_mode": classify_processing_mode(latest),
        "prompt_tokens": sum(item.prompt_tokens for item in turns),
        "completion_tokens": sum(item.completion_tokens for item in turns),
        "total_tokens": sum(item.total_tokens for item in turns),
        "latency_ms": sum(item.latency_ms for item in turns),
        "llm_intent": latest.llm_intent,
        "final_intent": latest.final_intent,
        "risk_notes": risk_notes,
        "linked_action_ids": [f"AI-{item.id}" for item in turns],
        "linked_actions": [
            {
                "action_id": f"AI-{item.id}",
                "created_at": item.created_at,
                "action_type": item.action_type,
                "result": item.result,
                "risk_level": item.risk_level,
                "write_applied": item.write_applied,
            }
            for item in turns
        ],
        "turns": [
            {
                "turn_no": item.turn_no,
                "created_at": item.created_at,
                "input_excerpt": item.input_excerpt,
                "result_label": item.result,
                "prompt_tokens": item.prompt_tokens,
                "completion_tokens": item.completion_tokens,
                "total_tokens": item.total_tokens,
                "latency_ms": item.latency_ms,
            }
            for item in turns
        ],
    }


def audit_summary(logs: list[AiAssistantRunLog]) -> dict[str, Any]:
    action_counts = Counter(item.action_type or item.final_intent or "unknown" for item in logs)
    risk_alerts = []
    high_risk_count = sum(1 for item in logs if item.risk_level == "高")
    fallback_write_count = sum(1 for item in logs if item.fallback_used and item.write_applied)
    if high_risk_count:
        risk_alerts.append(f"高风险动作 {high_risk_count} 次")
    if fallback_write_count:
        risk_alerts.append(f"{fallback_write_count} 条动作走 fallback 后又写库")
    return {
        "total_action_count": len(logs),
        "write_action_count": sum(1 for item in logs if item.write_applied),
        "high_risk_action_count": high_risk_count,
        "pending_confirm_count": sum(1 for item in logs if item.confirm_status == "pending"),
        "failed_action_count": sum(1 for item in logs if item.result == "失败" or item.error_type),
        "action_type_breakdown": [{"label": label, "count": count} for label, count in action_counts.most_common()],
        "risk_alerts": risk_alerts,
    }


def audit_action_item(item: AiAssistantRunLog) -> dict[str, Any]:
    return {
        "action_id": f"AI-{item.id}",
        "created_at": item.created_at,
        "session_id": item.session_id,
        "user_name": item.user_name,
        "input_excerpt": item.input_excerpt,
        "llm_intent": item.llm_intent,
        "executed_action": item.action_type,
        "target_label": item.target_label,
        "risk_level": item.risk_level,
        "result": item.result,
        "route_source": normalize_route_source(
            item.route_source,
            llm_called=item.llm_called,
            fallback_used=item.fallback_used,
            action_type=item.action_type,
        ),
        "fallback_used": item.fallback_used,
        "source_page": item.page_context,
    }


def parse_action_id(action_id: str) -> int | None:
    value = action_id.strip()
    if value.upper().startswith("AI-"):
        value = value[3:]
    try:
        return int(value)
    except ValueError:
        return None


def audit_action_detail(session: Session, action_id: str) -> dict[str, Any] | None:
    numeric_id = parse_action_id(action_id)
    if not numeric_id:
        return None
    item = session.get(AiAssistantRunLog, numeric_id)
    if not item:
        return None
    effects = session.exec(
        select(AiAssistantWriteEffect)
        .where(AiAssistantWriteEffect.run_log_id == item.id)
        .order_by(AiAssistantWriteEffect.created_at.asc())
    ).all()
    timeline = [
        {"label": "用户发消息", "detail": item.input_excerpt, "status": "done"},
        {"label": "AI 路由判断", "detail": item.llm_intent or item.final_intent or "unknown", "status": "done"},
    ]
    if item.confirm_required and item.confirm_status == "pending":
        timeline.append({"label": "返回待确认动作", "detail": "等待用户确认", "status": "pending"})
    if item.write_applied:
        timeline.append({"label": "后端执行真实动作", "detail": "已写入业务数据", "status": "done"})
    if effects:
        timeline.append({"label": "写库影响记录", "detail": f"记录 {len(effects)} 个对象影响", "status": "done"})
    target_objects = []
    if item.target_type or item.target_id or item.target_label:
        target_objects.append({"type": item.target_type, "id": item.target_id, "label": item.target_label})
    target_objects.extend(
        {"type": effect.object_type, "id": effect.object_id, "label": effect.object_label}
        for effect in effects
        if not (effect.object_type == item.target_type and effect.object_id == item.target_id)
    )
    return {
        "action_id": f"AI-{item.id}",
        "created_at": item.created_at,
        "session_id": item.session_id,
        "user_name": item.user_name,
        "entrypoint": item.entrypoint,
        "page_context": item.page_context,
        "input_excerpt": item.input_excerpt,
        "llm_intent": item.llm_intent,
        "final_intent": item.final_intent,
        "route_source": normalize_route_source(
            item.route_source,
            llm_called=item.llm_called,
            fallback_used=item.fallback_used,
            action_type=item.action_type,
        ),
        "fallback_used": item.fallback_used,
        "risk_level": item.risk_level,
        "action_type": item.action_type,
        "target_objects": target_objects,
        "write_applied": item.write_applied,
        "confirm_required": item.confirm_required,
        "confirm_status": item.confirm_status,
        "result": item.result,
        "timeline": timeline,
        "usage_meta": {
            "provider": item.provider,
            "model": item.model,
            "prompt_tokens": item.prompt_tokens,
            "completion_tokens": item.completion_tokens,
            "total_tokens": item.total_tokens,
            "latency_ms": item.latency_ms,
            "llm_called": item.llm_called,
            "route_source": normalize_route_source(
                item.route_source,
                llm_called=item.llm_called,
                fallback_used=item.fallback_used,
                action_type=item.action_type,
            ),
            "fallback_used": item.fallback_used,
            "result_kind": item.result_kind,
            "llm_intent": item.llm_intent,
            "final_intent": item.final_intent,
        },
        "write_effect": [
            {
                "object_type": effect.object_type,
                "object_id": effect.object_id,
                "object_label": effect.object_label,
                "change_type": effect.change_type,
                "before_summary": effect.before_summary,
                "after_summary": effect.after_summary,
                "audit_written": effect.audit_written,
            }
            for effect in effects
        ],
    }


def audit_actions_for_object(
    session: Session,
    *,
    object_type: str,
    object_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[AiAssistantRunLog]:
    object_type_value = object_type.strip()
    object_id_value = str(object_id).strip()
    if not object_type_value or not object_id_value:
        return []

    logs = query_run_logs(
        session,
        date_from=date_from,
        date_to=date_to,
    )
    matched: list[AiAssistantRunLog] = []
    for item in logs:
        if item.target_type == object_type_value and item.target_id == object_id_value:
            matched.append(item)
            continue
        effects = session.exec(
            select(AiAssistantWriteEffect).where(
                AiAssistantWriteEffect.run_log_id == item.id,
                AiAssistantWriteEffect.object_type == object_type_value,
                AiAssistantWriteEffect.object_id == object_id_value,
            )
        ).all()
        if effects:
            matched.append(item)
    return matched


def default_monitor_start_date() -> date:
    return (utcnow() - timedelta(days=7)).date()
