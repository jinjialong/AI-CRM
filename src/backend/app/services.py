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
    LeadContact,
    LEAD_STATUS_CONVERTED,
    LEAD_STATUS_FOLLOWING,
    LEAD_STATUS_INVALID,
    Lead,
    LeadFollowUp,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_SALES,
    User,
    VisitRecord,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def is_manager_or_admin(user: User) -> bool:
    return user.role in {ROLE_MANAGER, ROLE_ADMIN}


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
        "communication_time": note.communication_time,
        "method": note.method,
        "counterpart": note.counterpart,
        "content": note.content,
        "todo_items": note.todo_items,
        "created_at": note.created_at,
    }


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
    if lead.status == LEAD_STATUS_INVALID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效线索不能转客户")
    if lead.status == LEAD_STATUS_CONVERTED or lead.converted_customer_id:
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

    lead.status = LEAD_STATUS_CONVERTED
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
    contact_match = re.search(r"(联系人|联系人姓名|姓名)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    job_title_match = re.search(r"(职务|岗位|职位)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    wechat_match = re.search(r"(微信号|微信)[:：]?\s*(?:是|叫|为)?\s*([A-Za-z0-9_\-]+)", message)
    company_match = re.search(r"(公司|公司名称|企业|企业名称)[:：]?\s*(?:是|叫|为)?\s*([^\s，,。；;]+)", message)
    org_code_match = re.search(r"(组织机构代码|统一社会信用代码)[:：]?\s*([^\s，,。；;]+)", message)
    region_match = re.search(r"(大区|区域)[:：]?\s*(华北|华东|华南|华中|西南|西北|东北)", message)
    source_match = re.search(r"(来源)[:：]?\s*(转介绍|自然流量|KOC/SEM|外呼)", message)
    lead_id_match = re.search(r"(线索|客户)?\s*#?(\d+)", message)
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


async def try_openai_assistant(message: str) -> dict[str, Any] | None:
    if not settings.openai_api_key:
        return None

    system_prompt = (
        "你是一个中文 CRM 助手。"
        "你只能识别以下动作：create_lead、list_leads、list_public_pool、list_customers、convert_lead、unknown。"
        "请只返回 JSON，不要返回 markdown。"
        "JSON 格式为："
        "{\"kind\":\"动作名\",\"company_name\":\"\",\"organization_code\":\"\",\"region\":\"\",\"source\":\"\",\"contacts\":[{\"name\":\"\",\"job_title\":\"\",\"phone\":\"\",\"wechat\":\"\",\"is_primary\":true}],\"target_id\":null,\"reply\":\"给用户的简短中文说明\"}"
    )

    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
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
            import json

            return json.loads(content)
    except Exception:
        return None


def init_demo_data(session: Session) -> None:
    if session.exec(select(User)).first():
        return

    users = [
        User(login="sales01", name="销售一号", role=ROLE_SALES, password_hash=hash_password("123456")),
        User(login="sales02", name="销售二号", role=ROLE_SALES, password_hash=hash_password("123456")),
        User(login="manager01", name="销售经理", role=ROLE_MANAGER, password_hash=hash_password("123456")),
        User(login="admin01", name="系统管理员", role=ROLE_ADMIN, password_hash=hash_password("123456")),
    ]
    for user in users:
        session.add(user)
    session.flush()

    session.add_all(
        [
            ConfigItem(key="lead_sources", value="转介绍,自然流量,KOC/SEM,外呼"),
            ConfigItem(key="followup_methods", value="电话,微信,面谈,其他"),
        ]
    )

    lead1 = Lead(
        company_name="华北科技",
        organization_code="HB-001",
        region="华北",
        source="转介绍",
        owner_id=users[0].id,
        status=LEAD_STATUS_FOLLOWING,
        notes="已沟通初步需求",
        created_by_id=users[0].id,
    )
    lead2 = Lead(
        company_name="精工制造",
        organization_code="ZZ-002",
        region="华东",
        source="自然流量",
        owner_id=None,
        status=LEAD_STATUS_FOLLOWING,
        is_public=True,
        notes="进入公共线索池待领取",
        last_pool_at=utcnow(),
        created_by_id=users[2].id,
    )
    lead3 = Lead(
        company_name="星火零售",
        organization_code="LS-003",
        region="华南",
        source="外呼",
        owner_id=users[1].id,
        status=LEAD_STATUS_FOLLOWING,
        notes="意向较强，待转客户",
        created_by_id=users[1].id,
    )
    session.add_all([lead1, lead2, lead3])
    session.flush()

    session.add_all(
        [
            LeadContact(
                lead_id=lead1.id,
                name="张三",
                job_title="采购经理",
                phone="13800000001",
                wechat="zhangsancrm",
                is_primary=True,
                created_by_id=users[0].id,
            ),
            LeadContact(
                lead_id=lead2.id,
                name="李四",
                job_title="运营总监",
                phone="13800000002",
                wechat="lisi-biz",
                is_primary=True,
                created_by_id=users[2].id,
            ),
            LeadContact(
                lead_id=lead3.id,
                name="王总",
                job_title="总经理",
                phone="13800000003",
                wechat="wangzong-shop",
                is_primary=True,
                created_by_id=users[1].id,
            ),
        ]
    )

    session.add(
        LeadFollowUp(
            lead_id=lead1.id,
            method="电话",
            content="已确认下周安排产品演示",
            created_by_id=users[0].id,
        )
    )
    session.add(
        LeadFollowUp(
            lead_id=lead3.id,
            method="微信",
            content="客户正在内部评估方案",
            created_by_id=users[1].id,
        )
    )

    session.commit()
