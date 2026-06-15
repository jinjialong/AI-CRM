import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import httpx


ROOT = Path(__file__).resolve().parents[3]
BASE_URL = "http://127.0.0.1:8000"
DB_PATH = ROOT / "src" / "backend" / "data" / "app.db"
RESULTS_DIR = ROOT / "testing" / "acceptance"

RUN_STAMP = datetime.now().strftime("%Y%m%dT%H%M%S")

TEST_PHONES = {
    "12345",
    "13800000010",
    "13900000011",
    "13800000012",
    "13800000013",
    "13800000014",
    "13899110001",
    "13899110002",
    "13899110003",
}
TEST_COMPANIES = {"晨星科技", "蓝海智能", "华南那家公司", "Nova Tech"}


def db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now_text() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")


def cleanup_interfering_data() -> dict[str, Any]:
    with db_conn() as conn:
        cur = conn.cursor()
        lead_rows = cur.execute(
            f"""
            select distinct l.id, l.company_name
            from lead l
            left join leadcontact lc on lc.lead_id = l.id
            where l.company_name in ({",".join("?" for _ in TEST_COMPANIES)})
               or lc.phone in ({",".join("?" for _ in TEST_PHONES)})
               or l.company_name like '第三批回归-%'
               or l.company_name like '?????-%'
            """,
            [*TEST_COMPANIES, *TEST_PHONES],
        ).fetchall()
        lead_ids = [int(row["id"]) for row in lead_rows]
        customer_rows: list[sqlite3.Row] = []
        if lead_ids:
            placeholders = ",".join("?" for _ in lead_ids)
            customer_rows = cur.execute(
                f"select id, customer_name from customer where source_lead_id in ({placeholders})",
                lead_ids,
            ).fetchall()
            cur.execute(
                f"delete from contact where customer_id in (select id from customer where source_lead_id in ({placeholders}))",
                lead_ids,
            )
            cur.execute(
                f"delete from customerfollowup where customer_id in (select id from customer where source_lead_id in ({placeholders}))",
                lead_ids,
            )
            cur.execute(
                f"delete from visitrecord where customer_id in (select id from customer where source_lead_id in ({placeholders}))",
                lead_ids,
            )
            cur.execute(
                f"delete from communicationnote where customer_id in (select id from customer where source_lead_id in ({placeholders}))",
                lead_ids,
            )
            cur.execute(f"delete from customer where source_lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadcontact where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadfollowup where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadconversation where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadkeyevent where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadanalysiscurrent where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from leadanalysissnapshot where lead_id in ({placeholders})", lead_ids)
            cur.execute(f"delete from lead where id in ({placeholders})", lead_ids)
        conn.commit()
        return {
            "deleted_leads": [dict(row) for row in lead_rows],
            "deleted_customers": [dict(row) for row in customer_rows],
        }


def insert_lead(
    cur: sqlite3.Cursor,
    *,
    company: str,
    owner_id: int,
    phone: str,
    contact_name: str,
    converted: bool = False,
) -> tuple[int, int | None]:
    ts = now_text()
    cur.execute(
        """
        insert into lead(
            company_name, organization_code, region, source, owner_id, status, is_public,
            notes, converted_customer_id, converted_at, converted_by_id,
            last_pool_at, last_claimed_at, last_assigned_at,
            created_by_id, created_at, updated_at
        )
        values (?, '', '华北', '自然流量', ?, '跟进中', 0,
            '第三批回归前置', null, null, null,
            null, null, null,
            ?, ?, ?)
        """,
        (company, owner_id, owner_id, ts, ts),
    )
    lead_id = int(cur.lastrowid)
    cur.execute(
        """
        insert into leadcontact(lead_id, name, job_title, phone, wechat, is_primary, created_by_id, created_at)
        values (?, ?, '测试联系人', ?, '', 1, ?, ?)
        """,
        (lead_id, contact_name, phone, owner_id, ts),
    )
    customer_id = None
    if converted:
        cur.execute(
            """
            insert into customer(
                customer_name, source_lead_id, contact_name, phone, company_name,
                owner_id, notes, created_by_id, created_at, updated_at
            )
            values (?, ?, ?, ?, ?, ?, '第三批回归前置客户', ?, ?, ?)
            """,
            (company, lead_id, contact_name, phone, company, owner_id, owner_id, ts, ts),
        )
        customer_id = int(cur.lastrowid)
        cur.execute(
            "update lead set converted_customer_id=?, converted_at=?, converted_by_id=? where id=?",
            (customer_id, ts, owner_id, lead_id),
        )
    return lead_id, customer_id


def prepare_fixtures() -> dict[str, Any]:
    with db_conn() as conn:
        cur = conn.cursor()
        context_lead_id, _ = insert_lead(
            cur,
            company=f"第三批回归-上下文-{RUN_STAMP}",
            owner_id=1,
            phone="13899110001",
            contact_name="上下文张三",
        )
        converted_lead_id, converted_customer_id = insert_lead(
            cur,
            company=f"第三批回归-已转-{RUN_STAMP}",
            owner_id=1,
            phone="13899110002",
            contact_name="已转李四",
            converted=True,
        )
        no_access_lead_id, _ = insert_lead(
            cur,
            company=f"第三批回归-无权-{RUN_STAMP}",
            owner_id=2,
            phone="13899110003",
            contact_name="无权王五",
        )
        conn.commit()
        return {
            "context_lead_id": context_lead_id,
            "converted_lead_id": converted_lead_id,
            "converted_customer_id": converted_customer_id,
            "no_access_lead_id": no_access_lead_id,
        }


def db_counts() -> dict[str, int]:
    with db_conn() as conn:
        cur = conn.cursor()
        return {
            "leads": int(cur.execute("select count(*) from lead").fetchone()[0]),
            "customers": int(cur.execute("select count(*) from customer").fetchone()[0]),
            "logs": int(cur.execute("select count(*) from ai_assistant_run_log").fetchone()[0]),
        }


def latest_log_for_text(text: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        row = conn.execute(
            """
            select id, session_id, result, error_type, action_type, final_intent, result_kind, input_excerpt
            from ai_assistant_run_log
            where input_excerpt like ?
            order by id desc
            limit 1
            """,
            (f"%{text[:20]}%",),
        ).fetchone()
        return dict(row) if row else None


def login(client: httpx.Client, login_name: str, password: str = "123456") -> str:
    response = client.post(f"{BASE_URL}/api/v1/auth/login", json={"login": login_name, "password": password})
    response.raise_for_status()
    return response.json()["access_token"]


def send(
    client: httpx.Client,
    token: str,
    *,
    message: str = "",
    context: dict[str, Any] | None = None,
    session_id: int | None = None,
    confirm_action: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    payload: dict[str, Any] = {"message": message, "context": context or {}}
    if session_id is not None:
        payload["session_id"] = session_id
    if confirm_action is not None:
        payload["confirm_action"] = confirm_action
    response = client.post(
        f"{BASE_URL}/api/v1/assistant/message",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}
    return response.status_code, body


def result_value(body: dict[str, Any], path: str, default=None):
    current: Any = body
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part, default)
        else:
            return default
    return current


def extract_record(
    case_id: str,
    expected: str,
    http_status: int,
    body: dict[str, Any],
    before: dict[str, int],
    after: dict[str, int],
    notes: str = "",
) -> dict[str, Any]:
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    usage = body.get("usage_meta") if isinstance(body.get("usage_meta"), dict) else {}
    lead = data.get("lead") if isinstance(data.get("lead"), dict) else {}
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    customers = data.get("customers") if isinstance(data.get("customers"), list) else None
    leads = data.get("leads") if isinstance(data.get("leads"), list) else None
    draft = data.get("draft_action") if isinstance(data.get("draft_action"), dict) else None
    return {
        "case_id": case_id,
        "http_ok": 200 <= http_status < 300,
        "http_status": http_status,
        "result_kind": body.get("result_kind"),
        "message": body.get("message"),
        "data_status": data.get("status"),
        "final_intent": usage.get("final_intent"),
        "llm_intent": usage.get("llm_intent"),
        "route_source": usage.get("route_source"),
        "fallback_used": usage.get("fallback_used"),
        "session_id": data.get("session_id"),
        "draft_kind": draft.get("kind") if draft else None,
        "lead_id": lead.get("id"),
        "lead_company": lead.get("company_name"),
        "customer_id": customer.get("id"),
        "customers_returned": len(customers) if customers is not None else None,
        "leads_returned": len(leads) if leads is not None else None,
        "lead_delta": after["leads"] - before["leads"],
        "customer_delta": after["customers"] - before["customers"],
        "missing_fields": ",".join(data.get("missing_fields") or []) if isinstance(data.get("missing_fields"), list) else "",
        "error_type": data.get("error_type"),
        "expected": expected,
        "notes": notes,
        "ok": False,
        "failure_reason": "",
    }


def finalize(record: dict[str, Any], ok: bool, reason: str = "") -> dict[str, Any]:
    record["ok"] = bool(ok)
    record["failure_reason"] = "" if ok else reason
    return record


def no_write(record: dict[str, Any]) -> bool:
    return record["lead_delta"] == 0 and record["customer_delta"] == 0


def run_single(
    client: httpx.Client,
    token: str,
    case_id: str,
    message: str,
    expected: str,
    checker: Callable[[dict[str, Any], dict[str, Any]], tuple[bool, str]],
    *,
    context: dict[str, Any] | None = None,
    session_id: int | None = None,
    confirm_action: dict[str, Any] | None = None,
    notes: str = "",
) -> tuple[dict[str, Any], dict[str, Any]]:
    before = db_counts()
    status, body = send(
        client,
        token,
        message=message,
        context=context,
        session_id=session_id,
        confirm_action=confirm_action,
    )
    after = db_counts()
    record = extract_record(case_id, expected, status, body, before, after, notes=notes)
    ok, reason = checker(record, body)
    return finalize(record, ok, reason), body


def run() -> dict[str, Any]:
    cleanup_before = cleanup_interfering_data()
    fixtures = prepare_fixtures()
    records: list[dict[str, Any]] = []

    with httpx.Client(timeout=40.0) as client:
        sales_token = login(client, "sales01")
        admin_token = login(client, "admin01")

        records.append(
            run_single(
                client,
                sales_token,
                "CL-14",
                "创建线索，公司叫晨星科技，联系人张三，手机号12345",
                "无效手机号不应创建",
                lambda r, b: (r["http_ok"] and r["result_kind"] != "lead_created" and no_write(r), "无效手机号被创建或写库"),
            )[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "CL-15",
                "帮我记一下，上周展会认识了一家公司，好像挺有意向，公司叫蓝海智能，联系人可能叫陈总，电话13800000010，你先帮我录一下",
                "尽量提取有效字段；可创建或澄清，但不能写脏数据",
                lambda r, b: (
                    r["http_ok"]
                    and (
                        (r["result_kind"] == "lead_created" and r["lead_delta"] == 1 and r["lead_company"] == "蓝海智能")
                        or (r["result_kind"] == "message" and no_write(r))
                    ),
                    "没有创建有效线索，也不是安全澄清",
                ),
            )[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "CU-06",
                "查一个不存在的客户",
                "返回空客户结果，不报错",
                lambda r, b: (
                    r["http_ok"] and r["result_kind"] == "customer_list" and r["customers_returned"] == 0 and no_write(r),
                    "未返回空客户列表或发生写库",
                ),
            )[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "CV-03",
                "这条线索帮我转一下客户",
                "带 lead_id 上下文时进入待确认",
                lambda r, b: (
                    r["http_ok"] and r["result_kind"] == "draft_action" and r["draft_kind"] == "convert_lead" and no_write(r),
                    "未进入转客户待确认或发生写库",
                ),
                context={"lead_id": fixtures["context_lead_id"]},
                notes=f"context_lead_id={fixtures['context_lead_id']}",
            )[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "CV-09",
                f"转客户 {fixtures['converted_lead_id']}",
                "已转客户线索再次转，应失败或不写库",
                lambda r, b: (
                    r["http_ok"] and r["result_kind"] not in {"draft_action", "customer_created"} and no_write(r),
                    "已转客户线索仍进入草稿/创建客户或写库",
                ),
                notes=f"converted_lead_id={fixtures['converted_lead_id']}",
            )[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "CV-11",
                "",
                "未知 confirm_action 应失败",
                lambda r, b: (
                    r["http_ok"] and r["result_kind"] == "message" and r["data_status"] == "failed" and no_write(r),
                    "未知确认动作未稳定失败",
                ),
                confirm_action={"kind": "unknown_action", "payload": {}},
                notes="confirm_action.kind=unknown_action",
            )[0]
        )
        records.append(
            run_single(
                client,
                admin_token,
                "CF-02",
                "跟进方式有哪些",
                "返回 followup_methods 配置",
                lambda r, b: (
                    r["http_ok"]
                    and r["final_intent"] == "show_config"
                    and isinstance(result_value(b, "data.followup_methods"), list)
                    and len(result_value(b, "data.followup_methods")) > 0
                    and no_write(r),
                    "未返回跟进方式配置",
                ),
            )[0]
        )
        records.append(
            run_single(
                client,
                admin_token,
                "CF-03",
                "线索来源配置是什么",
                "返回 lead_sources 配置",
                lambda r, b: (
                    r["http_ok"]
                    and r["final_intent"] == "show_config"
                    and isinstance(result_value(b, "data.lead_sources"), list)
                    and len(result_value(b, "data.lead_sources")) > 0
                    and no_write(r),
                    "未返回线索来源配置",
                ),
            )[0]
        )
        records.append(
            run_single(client, sales_token, "CH-02", "今天天气怎么样", "普通回复，不写库", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "闲聊发生写库或未返回消息"))[0]
        )
        records.append(
            run_single(client, sales_token, "CH-03", "这个那个帮我弄一下", "澄清，不写库", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "半句输入发生写库或未返回消息"))[0]
        )
        records.append(
            run_single(client, sales_token, "CH-04", "asdfghjkl", "普通回复或澄清，不写库", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "无意义字符发生写库或未返回消息"))[0]
        )
        records.append(
            run_single(client, sales_token, "CH-05", "", "空消息提示能力", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "空消息未返回能力提示或发生写库"))[0]
        )
        records.append(
            run_single(client, sales_token, "RW-01", "帮我先记一个，华南那家公司，联系人老李，电话13900000011", "模糊公司名不应直接写脏数据", lambda r, b: (r["http_ok"] and r["result_kind"] != "lead_created" and no_write(r), "模糊公司名被创建或写库"))[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "RW-02",
                "今天开会顺手记一下，蓝海智能，联系人王总，手机号13800000012，别忘了后面再跟",
                "尽量提取公司、联系人、手机号、备注",
                lambda r, b: (
                    r["http_ok"]
                    and (
                        (r["result_kind"] == "lead_created" and r["lead_delta"] == 1 and r["lead_company"] == "蓝海智能")
                        or (r["result_kind"] == "message" and no_write(r))
                    ),
                    "夹杂无关信息未安全处理",
                ),
            )[0]
        )
        records.append(
            run_single(client, sales_token, "RW-03", "帮我转客乎 3", "错别字稳定回复，不误写库", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "错别字输入报错或发生写库"))[0]
        )
        records.append(
            run_single(client, sales_token, "RW-04", "13800000013 这个客户你看看", "只有手机号不应误判创建成功", lambda r, b: (r["http_ok"] and r["result_kind"] != "lead_created" and no_write(r), "手机号查询被误创建或写库"))[0]
        )
        records.append(
            run_single(client, sales_token, "RW-05", "????????", "乱码不应成功写业务", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "乱码输入发生写库或未稳定回复"))[0]
        )
        records.append(
            run_single(
                client,
                sales_token,
                "RW-06",
                "create lead，公司叫Nova Tech，联系人Tom，手机13800000014",
                "中英混合可创建或澄清，不崩溃",
                lambda r, b: (
                    r["http_ok"]
                    and (
                        (r["result_kind"] == "lead_created" and r["lead_delta"] == 1 and r["lead_company"] == "Nova Tech")
                        or (r["result_kind"] == "message" and no_write(r))
                    ),
                    "中英混合输入未安全处理",
                ),
            )[0]
        )

        before = db_counts()
        status1, body1 = send(client, sales_token, message="帮我建个线索")
        sid = result_value(body1, "data.session_id")
        status2, body2 = send(client, sales_token, message="算了，先看看我的线索", session_id=sid if isinstance(sid, int) else None)
        after = db_counts()
        record = extract_record(
            "RW-07",
            "连续追问时第二句应切换到线索查询",
            status2,
            body2,
            before,
            after,
            notes=f"first_status={status1}; first_kind={body1.get('result_kind')}; session_id={sid}",
        )
        records.append(finalize(record, record["http_ok"] and record["result_kind"] == "lead_list" and no_write(record), "第二句未切换到线索查询或发生写库"))

        before = db_counts()
        status1, body1 = send(client, sales_token, message="创建线索")
        sid = result_value(body1, "data.session_id")
        status2, body2 = send(client, sales_token, message="不用了", session_id=sid if isinstance(sid, int) else None)
        status3, body3 = send(client, sales_token, message="查我的客户", session_id=sid if isinstance(sid, int) else None)
        after = db_counts()
        record = extract_record(
            "RW-08",
            "草稿中断后查客户，不被旧草稿污染",
            status3,
            body3,
            before,
            after,
            notes=f"first_kind={body1.get('result_kind')}; second_kind={body2.get('result_kind')}; session_id={sid}",
        )
        records.append(finalize(record, record["http_ok"] and record["result_kind"] == "customer_list" and no_write(record), "第三句未进入客户查询或发生写库"))

        records.append(
            run_single(
                client,
                sales_token,
                "MO-03",
                "把这条线索转成客户",
                "详情页上下文兜底进入待确认，不写库",
                lambda r, b: (
                    r["http_ok"]
                    and r["result_kind"] == "draft_action"
                    and r["draft_kind"] == "convert_lead"
                    and r["route_source"] == "fallback_after_unknown"
                    and no_write(r),
                    "上下文转客户未走兜底待确认或发生写库",
                ),
                context={"lead_id": fixtures["context_lead_id"]},
                notes=f"context_lead_id={fixtures['context_lead_id']}",
            )[0]
        )
        records.append(
            run_single(client, sales_token, "MO-04", "你是谁", "普通回复监控，不写库", lambda r, b: (r["http_ok"] and r["result_kind"] == "message" and no_write(r), "普通回复未稳定返回或发生写库"))[0]
        )
        record, _ = run_single(
            client,
            sales_token,
            "MO-05",
            f"转客户 {fixtures['no_access_lead_id']}",
            "无权限转客户应返回失败并记录失败动作",
            lambda r, b: (
                r["http_ok"] and r["result_kind"] == "message" and r["data_status"] == "failed" and no_write(r),
                "无权限转客户未返回失败消息或发生写库",
            ),
            notes=f"no_access_lead_id={fixtures['no_access_lead_id']}",
        )
        log = latest_log_for_text(f"转客户 {fixtures['no_access_lead_id']}")
        record["audit_log"] = log
        if record["ok"] and not (log and (log.get("result") == "失败" or log.get("error_type"))):
            record = finalize(record, False, "未找到失败审计动作记录")
        records.append(record)

    summary = {
        "run_id": f"third-batch-rerun-{RUN_STAMP}",
        "source_doc": "docs/1.2/1.2测试/1.2测试-AI助手测试用例集.md",
        "scope": "4.3 第三批",
        "total": len(records),
        "passed": sum(1 for item in records if item["ok"]),
        "failed": sum(1 for item in records if not item["ok"]),
        "failed_cases": [item["case_id"] for item in records if not item["ok"]],
    }
    cleanup_after = cleanup_interfering_data()
    return {
        "summary": summary,
        "cleanup_before_run": cleanup_before,
        "fixtures": fixtures,
        "records": records,
        "cleanup_after_run": cleanup_after,
    }


def main() -> int:
    result = run()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    result_path = RESULTS_DIR / f"third_batch_rerun_2026-06-15_{RUN_STAMP}.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"result_path": str(result_path), "summary": result["summary"]}, ensure_ascii=False, indent=2))
    return 0 if result["summary"]["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
