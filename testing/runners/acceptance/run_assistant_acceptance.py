import json
import os
import sys
from datetime import datetime
from pathlib import Path
from statistics import mean, median
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = ROOT / "testing" / "datasets" / "acceptance" / "assistant_token_smoke.json"
RESULTS_ROOT = ROOT / "testing" / "results" / "acceptance"


def utc_timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def load_dataset(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def mask_text(text: str) -> str:
    masked = text
    for phone in set(__import__("re").findall(r"1\d{10}", text)):
        masked = masked.replace(phone, f"{phone[:3]}****{phone[-4:]}")
    return masked


def unique_suffix(case_id: str, repeat_index: int) -> str:
    return f"{case_id.lower()}-{repeat_index}-{utc_timestamp().lower()}"


def apply_runtime_template(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        result = value
        for key, item in variables.items():
            result = result.replace(f"{{{{{key}}}}}", str(item))
        return result
    if isinstance(value, list):
        return [apply_runtime_template(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: apply_runtime_template(item, variables) for key, item in value.items()}
    return value


def login(client: httpx.Client, base_url: str, login_name: str, password: str) -> str:
    response = client.post(
        f"{base_url}/api/v1/auth/login",
        json={"login": login_name, "password": password},
    )
    response.raise_for_status()
    return response.json()["access_token"]


def discard_lead_creation_session(client: httpx.Client, base_url: str, token: str, session_id: int) -> None:
    response = client.post(
        f"{base_url}/api/v1/skills/lead-creation/discard",
        headers={"Authorization": f"Bearer {token}"},
        json={"session_id": session_id},
    )
    response.raise_for_status()


def clear_active_lead_creation_session(client: httpx.Client, base_url: str, token: str) -> None:
    response = client.post(
        f"{base_url}/api/v1/assistant/message",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "帮我建个线索，公司叫临时清理会话"},
    )
    response.raise_for_status()
    body = response.json()
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    session_id = data.get("session_id")
    if isinstance(session_id, int):
        discard_lead_creation_session(client, base_url, token, session_id)


def search_leads(client: httpx.Client, base_url: str, token: str) -> list[dict[str, Any]]:
    response = client.get(
        f"{base_url}/api/v1/leads",
        headers={"Authorization": f"Bearer {token}"},
    )
    response.raise_for_status()
    body = response.json()
    if isinstance(body, list):
        return body
    if isinstance(body, dict) and isinstance(body.get("items"), list):
        return body["items"]
    return []


def create_lead_via_skill(client: httpx.Client, base_url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post(
        f"{base_url}/api/v1/skills/lead-creation",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    response.raise_for_status()
    return response.json()


def find_lead_id_by_company(leads: list[dict[str, Any]], company_name: str) -> int | None:
    for lead in leads:
        if str(lead.get("company_name", "")).strip() == company_name.strip():
            return int(lead["id"])
    return None


def read_path(data: Any, path: str) -> Any:
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def build_confirm_action(data: dict[str, Any]) -> dict[str, Any] | None:
    draft_action = data.get("draft_action")
    if isinstance(draft_action, dict) and draft_action.get("kind"):
        return {
            "kind": draft_action.get("kind"),
            "payload": dict(draft_action.get("payload") or {}),
        }
    return None


def turn_success(body: dict[str, Any], turn_expect: dict[str, Any]) -> tuple[bool, list[str]]:
    errors: list[str] = []
    expected_result_kind = str(turn_expect.get("result_kind") or "").strip()
    if expected_result_kind and body.get("result_kind") != expected_result_kind:
        errors.append(f"result_kind={body.get('result_kind')} != {expected_result_kind}")

    equals = turn_expect.get("equals")
    if isinstance(equals, dict):
        for path, expected in equals.items():
            actual = read_path(body, path)
            if actual != expected:
                errors.append(f"{path}={actual!r} != {expected!r}")

    contains = turn_expect.get("contains")
    if isinstance(contains, dict):
        for path, expected in contains.items():
            actual = read_path(body, path)
            if expected not in str(actual or ""):
                errors.append(f"{path} does not contain {expected!r}")

    return (len(errors) == 0, errors)


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    total_tokens = [item["usage_meta"]["total_tokens"] for item in records]
    latencies = [item["usage_meta"]["latency_ms"] for item in records]
    successes = [1 if item["success"] else 0 for item in records]
    fallback_used = [1 if item["usage_meta"]["fallback_used"] else 0 for item in records]
    return {
        "total_runs": len(records),
        "pass_rate": mean(successes) if successes else 0,
        "avg_total_tokens": mean(total_tokens) if total_tokens else 0,
        "median_total_tokens": median(total_tokens) if total_tokens else 0,
        "max_total_tokens": max(total_tokens) if total_tokens else 0,
        "avg_latency_ms": mean(latencies) if latencies else 0,
        "median_latency_ms": median(latencies) if latencies else 0,
        "max_latency_ms": max(latencies) if latencies else 0,
        "fallback_rate": mean(fallback_used) if fallback_used else 0,
    }


def main() -> int:
    dataset_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATASET
    base_url = os.getenv("ASSISTANT_ACCEPTANCE_BASE_URL", "http://127.0.0.1:8000")
    dataset = load_dataset(dataset_path)

    run_id = f"assistant-acceptance-{utc_timestamp()}"
    run_dir = RESULTS_ROOT / run_id
    ensure_dir(run_dir)

    records: list[dict[str, Any]] = []
    meta = {
        "run_id": run_id,
        "dataset_id": dataset.get("dataset_id", ""),
        "dataset_path": str(dataset_path),
        "base_url": base_url,
        "started_at": datetime.utcnow().isoformat() + "Z",
    }

    with httpx.Client(timeout=30.0) as client:
        for case in dataset.get("cases", []):
            repeat = int(case.get("repeat", 1))
            for repeat_index in range(1, repeat + 1):
                token = login(client, base_url, case["login"], case["password"])
                runtime_context: dict[str, Any] = {}
                suffix = unique_suffix(case["case_id"], repeat_index)
                suffix_digits = "".join(ch for ch in suffix if ch.isdigit())
                short_digits = f"{repeat_index % 10}{suffix_digits[-3:].rjust(3, '0')}"
                runtime_variables = {
                    "suffix": suffix,
                    "phone_tail": short_digits,
                }

                if str(case.get("case_id", "")).startswith("CL-"):
                    clear_active_lead_creation_session(client, base_url, token)

                setup = case.get("setup") or {}
                create_lead = setup.get("create_lead")
                if isinstance(create_lead, dict):
                    lead_payload = apply_runtime_template(create_lead, runtime_variables)
                    created = create_lead_via_skill(client, base_url, token, lead_payload)
                    lead = created.get("lead") if isinstance(created.get("lead"), dict) else {}
                    if lead.get("id") is not None:
                        runtime_context["lead_id"] = int(lead["id"])
                lead_search = setup.get("lead_search")
                if isinstance(lead_search, dict) and lead_search.get("company_name"):
                    search_payload = apply_runtime_template(lead_search, runtime_variables)
                    leads = search_leads(client, base_url, token)
                    lead_id = find_lead_id_by_company(leads, str(search_payload["company_name"]))
                    if lead_id is not None:
                        runtime_context["lead_id"] = lead_id

                session_id = None
                for turn_index, turn in enumerate(case.get("turns", []), start=1):
                    turn = apply_runtime_template(turn, runtime_variables)
                    context = dict(turn.get("context") or {})
                    if turn.get("context_from_setup") == "lead_id" and runtime_context.get("lead_id") is not None:
                        context["lead_id"] = runtime_context["lead_id"]

                    payload: dict[str, Any] = {"context": context}
                    if turn.get("confirm_from_previous_draft"):
                        confirm_action = runtime_context.get("draft_action")
                        if not isinstance(confirm_action, dict):
                            raise RuntimeError(f"case={case['case_id']} turn={turn_index} 缺少上一轮 draft_action，无法执行确认动作")
                        payload["message"] = ""
                        payload["confirm_action"] = confirm_action
                    else:
                        payload["message"] = turn["message"]

                    if session_id is not None:
                        payload["session_id"] = session_id

                    response = client.post(
                        f"{base_url}/api/v1/assistant/message",
                        headers={"Authorization": f"Bearer {token}"},
                        json=payload,
                    )
                    response.raise_for_status()
                    body = response.json()
                    data = body.get("data") if isinstance(body.get("data"), dict) else {}
                    if data.get("session_id") is not None:
                        session_id = data["session_id"]
                    draft_action = build_confirm_action(data)
                    if draft_action is not None:
                        runtime_context["draft_action"] = draft_action

                    turn_expect = turn.get("expect") or {}
                    success, errors = turn_success(body, turn_expect)

                    records.append(
                        {
                            "run_id": run_id,
                            "case_id": case["case_id"],
                            "title": case["title"],
                            "repeat_index": repeat_index,
                            "turn_index": turn_index,
                            "message_masked": mask_text(turn.get("message") or f"确认执行 {runtime_context.get('draft_action', {}).get('kind', '')}"),
                            "context": context,
                            "result_kind": body.get("result_kind"),
                            "success": success,
                            "errors": errors,
                            "usage_meta": body.get("usage_meta", {}),
                        }
                    )

    meta["finished_at"] = datetime.utcnow().isoformat() + "Z"

    summary = summarize(records)
    summary["cases"] = sorted({item["case_id"] for item in records})

    (run_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    with (run_dir / "records.jsonl").open("w", encoding="utf-8") as fp:
        for item in records:
            fp.write(json.dumps(item, ensure_ascii=False) + "\n")
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"run_id": run_id, "summary": summary}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
