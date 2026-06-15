from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel import select

from app.core.deps import get_current_user
from app.core.security import hash_password
from app.models import AiAssistantRunLog, Customer, Lead, LeadContact, ROLE_ADMIN, ROLE_SALES, User
from app.routers import assistant as assistant_router_module
from app.routers import admin as admin_router_module
from app.routers.admin import router as admin_router
from app.routers.assistant import router as assistant_router
from app.skills.lead_creation import (
    LEAD_CREATION_SCENE,
    build_lead_creation_draft,
    get_lead_creation_context,
    get_or_create_assistant_session,
    save_assistant_session_draft,
)
from app.services import parse_assistant_text


def _build_test_app(session: Session, current_user: User) -> FastAPI:
    app = FastAPI()
    app.include_router(assistant_router, prefix="/api/v1")
    current_user_stub = User(
        id=current_user.id,
        login=current_user.login,
        name=current_user.name,
        role=current_user.role,
        manager_id=current_user.manager_id,
        password_hash=current_user.password_hash,
        active=current_user.active,
        created_at=current_user.created_at,
    )

    def override_get_session() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[assistant_router_module.get_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: current_user_stub
    return app


def _build_monitor_test_app(session: Session, current_user: User) -> FastAPI:
    app = FastAPI()
    app.include_router(assistant_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    current_user_stub = User(
        id=current_user.id,
        login=current_user.login,
        name=current_user.name,
        role=current_user.role,
        manager_id=current_user.manager_id,
        password_hash=current_user.password_hash,
        active=current_user.active,
        created_at=current_user.created_at,
    )

    def override_get_session() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[assistant_router_module.get_session] = override_get_session
    app.dependency_overrides[admin_router_module.get_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: current_user_stub
    return app


def _create_user(session: Session, *, login: str, name: str, role: str = ROLE_SALES) -> User:
    user = User(
        login=login,
        name=name,
        role=role,
        password_hash=hash_password("123456"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_lead(
    session: Session,
    *,
    company_name: str,
    owner_id: int,
    region: str,
    status: str,
    phone: str,
) -> Lead:
    lead = Lead(
        company_name=company_name,
        organization_code="",
        region=region,
        source="自然流量",
        owner_id=owner_id,
        status=status,
        created_by_id=owner_id,
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)

    session.add(
        LeadContact(
            lead_id=lead.id,
            name="张三",
            phone=phone,
            job_title="采购经理",
            wechat="",
            is_primary=True,
            created_by_id=owner_id,
        )
    )
    session.commit()
    session.refresh(lead)
    return lead


def _create_customer(
    session: Session,
    *,
    customer_name: str,
    company_name: str,
    contact_name: str,
    phone: str,
    owner_id: int,
) -> Customer:
    customer = Customer(
        customer_name=customer_name,
        source_lead_id=1,
        contact_name=contact_name,
        phone=phone,
        company_name=company_name,
        owner_id=owner_id,
        created_by_id=owner_id,
    )
    session.add(customer)
    session.commit()
    session.refresh(customer)
    return customer


def test_convert_lead_uses_page_context_when_target_id_missing(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000001",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "convert_lead",
                "reply": "",
                "confidence": 1,
                "slots": {},
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "把这条线索转成客户",
                    "context": {"lead_id": lead.id},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "draft_action"
        assert payload["data"]["draft_action"]["kind"] == "convert_lead"
        assert payload["data"]["draft_action"]["payload"]["lead_id"] == lead.id


def test_convert_lead_falls_back_from_chat_when_page_context_present(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000001",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "chat",
                "reply": "好的，我来帮您处理。",
                "confidence": 0.62,
                "slots": {},
                "next_action": "reply",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "把这条线索转成客户",
                    "context": {"lead_id": lead.id},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "draft_action"
        assert payload["data"]["draft_action"]["kind"] == "convert_lead"
        assert payload["data"]["draft_action"]["payload"]["lead_id"] == lead.id
        assert payload["usage_meta"]["route_source"] == "fallback_after_unknown"


def test_convert_lead_uses_deterministic_page_context_rule_without_llm(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000001",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            raise AssertionError("should not call llm for deterministic page-context convert")

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "把这条线索转成客户",
                    "context": {"lead_id": lead.id},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "draft_action"
        assert payload["data"]["draft_action"]["kind"] == "convert_lead"
        assert payload["data"]["draft_action"]["payload"]["lead_id"] == lead.id
        assert payload["usage_meta"]["route_source"] == "fallback_after_unknown"
        assert payload["usage_meta"]["fallback_used"] is True


def test_list_leads_supports_basic_region_and_status_filters(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000001",
        )
        _create_lead(
            session,
            company_name="华东制造",
            owner_id=user.id,
            region="华东",
            status="跟进中",
            phone="13800000002",
        )
        _create_lead(
            session,
            company_name="华北零售",
            owner_id=user.id,
            region="华北",
            status="高风险",
            phone="13800000003",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_leads",
                "reply": "",
                "confidence": 1,
                "slots": {
                    "company_name": "",
                    "region": "华北",
                    "status": "跟进中",
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "帮我看看华北跟进中的线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["data"]["filters"] == {
            "search": "",
            "status": "跟进中",
            "region": "华北",
        }
        assert len(payload["data"]["leads"]) == 1
        assert payload["data"]["leads"][0]["id"] == matching_lead.id


def test_list_public_pool_supports_basic_region_and_status_filters(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_lead = _create_lead(
            session,
            company_name="华北公共线索",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000011",
        )
        matching_lead.is_public = True
        matching_lead.owner_id = None
        session.add(matching_lead)
        session.commit()
        session.refresh(matching_lead)

        other_region = _create_lead(
            session,
            company_name="华东公共线索",
            owner_id=user.id,
            region="华东",
            status="跟进中",
            phone="13800000012",
        )
        other_region.is_public = True
        other_region.owner_id = None
        session.add(other_region)
        session.commit()

        other_status = _create_lead(
            session,
            company_name="华北高风险公共线索",
            owner_id=user.id,
            region="华北",
            status="高风险",
            phone="13800000013",
        )
        other_status.is_public = True
        other_status.owner_id = None
        session.add(other_status)
        session.commit()

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_public_pool",
                "reply": "",
                "confidence": 1,
                "slots": {
                    "company_name": "",
                    "region": "华北",
                    "status": "跟进中",
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "看看华北跟进中的公共线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["data"]["filters"] == {
            "search": "",
            "status": "跟进中",
            "region": "华北",
        }
        assert len(payload["data"]["leads"]) == 1
        assert payload["data"]["leads"][0]["id"] == matching_lead.id


def test_list_customers_supports_basic_search(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_customer = _create_customer(
            session,
            customer_name="华北科技",
            company_name="华北科技",
            contact_name="张三",
            phone="13800000021",
            owner_id=user.id,
        )
        _create_customer(
            session,
            customer_name="华东制造",
            company_name="华东制造",
            contact_name="李四",
            phone="13800000022",
            owner_id=user.id,
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_customers",
                "reply": "",
                "confidence": 1,
                "slots": {
                    "company_name": "华北科技",
                    "contacts": [],
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查询华北科技客户",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "customer_list"
        assert payload["data"]["filters"] == {
            "search": "华北科技",
        }
        assert len(payload["data"]["customers"]) == 1
        assert payload["data"]["customers"][0]["id"] == matching_customer.id


def test_list_customers_query_overrides_create_lead_misroute(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        _create_customer(
            session,
            customer_name="华北科技",
            company_name="华北科技",
            contact_name="张三",
            phone="13800000021",
            owner_id=user.id,
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "create_lead",
                "reply": "请提供公司名称。",
                "confidence": 0.72,
                "slots": {
                    "company_name": "",
                    "contacts": [{"name": "不存在先生", "phone": "19900001111"}],
                },
                "next_action": "clarify",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查询客户联系人不存在先生电话19900001111",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "customer_list"
        assert payload["usage_meta"]["llm_intent"] == "create_lead"
        assert payload["usage_meta"]["final_intent"] == "list_customers"
        assert payload["data"]["filters"]["search"]
        assert payload["data"]["customers"] == []


def test_list_leads_merges_status_filter_from_text_when_model_slots_empty(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000021",
        )
        _create_lead(
            session,
            company_name="高风险公司",
            owner_id=user.id,
            region="华北",
            status="高风险",
            phone="13800000022",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_leads",
                "reply": "",
                "confidence": 1,
                "slots": {
                    "company_name": "",
                    "region": "",
                    "status": "",
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查询跟进中的线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["data"]["filters"]["status"] == "跟进中"
        assert len(payload["data"]["leads"]) == 1
        assert payload["data"]["leads"][0]["id"] == matching_lead.id


def test_global_search_overrides_ambiguous_model_route(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        customer = _create_customer(
            session,
            customer_name="留空测试公司",
            company_name="留空测试公司",
            contact_name="留空联系人",
            phone="13819990001",
            owner_id=user.id,
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_leads",
                "reply": "",
                "confidence": 0.82,
                "slots": {
                    "company_name": "",
                    "region": "",
                    "status": "",
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查一下留空测试公司",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "global_search"
        assert payload["usage_meta"]["llm_intent"] == "list_leads"
        assert payload["usage_meta"]["final_intent"] == "global_search"
        assert payload["data"]["counts"]["customers"] == 1
        assert payload["data"]["counts"]["leads"] == 0
        assert payload["data"]["counts"]["public_pool_leads"] == 0
        assert payload["data"]["customers"][0]["id"] == customer.id


def test_explicit_customer_search_does_not_become_global_search(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        customer = _create_customer(
            session,
            customer_name="留空测试公司",
            company_name="留空测试公司",
            contact_name="留空联系人",
            phone="13819990001",
            owner_id=user.id,
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "list_leads",
                "reply": "",
                "confidence": 0.75,
                "slots": {},
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查客户留空测试公司",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "customer_list"
        assert payload["usage_meta"]["final_intent"] == "list_customers"
        assert payload["data"]["filters"]["search"] == "留空测试公司"
        assert payload["data"]["customers"][0]["id"] == customer.id


def test_explicit_lead_search_does_not_become_global_search(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        lead = _create_lead(
            session,
            company_name="留空测试公司",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13819990001",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "global_search",
                "reply": "",
                "confidence": 0.75,
                "slots": {},
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查留空测试公司的线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["usage_meta"]["final_intent"] == "list_leads"
        assert payload["data"]["leads"][0]["id"] == lead.id


def test_global_search_returns_empty_groups_when_no_match(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "unknown",
                "reply": "请提供更多信息。",
                "confidence": 0.2,
                "slots": {},
                "next_action": "reply",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "找一下不存在公司",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "global_search"
        assert payload["data"]["counts"] == {
            "customers": 0,
            "leads": 0,
            "public_pool_leads": 0,
        }
        assert payload["data"]["customers"] == []
        assert payload["data"]["leads"] == []
        assert payload["data"]["public_pool_leads"] == []


def test_parse_assistant_text_extracts_multiple_contacts_and_notes():
    parsed = parse_assistant_text(
        "帮我新建线索，公司名称华北科技，联系人张三，手机号13800000011，"
        "联系人李四，手机号13900000022，备注重点跟进"
    )

    assert parsed["company_name"] == "华北科技"
    assert parsed["notes"] == "重点跟进"
    assert parsed["contacts"] == [
        {
            "name": "张三",
            "job_title": "",
            "phone": "13800000011",
            "wechat": "",
            "is_primary": True,
        },
        {
            "name": "李四",
            "job_title": "",
            "phone": "13900000022",
            "wechat": "",
            "is_primary": False,
        },
    ]


def test_lead_creation_draft_update_is_not_stolen_by_global_search(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        assistant_session = get_or_create_assistant_session(session, user.id, LEAD_CREATION_SCENE)
        save_assistant_session_draft(
            session,
            assistant_session,
            build_lead_creation_draft(
                {
                    "company_name": "第四批北方能源",
                    "contacts": [],
                }
            ),
            status="active",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "intent": "create_lead",
                "reply": "",
                "confidence": 0.85,
                "slots": {
                    "company_name": "",
                    "contacts": [{"name": "李四", "phone": "13914001601"}],
                },
                "next_action": "call_skill",
                "target_id": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "联系人李四，手机号13914001601",
                    "session_id": assistant_session.id,
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_created"
        assert payload["usage_meta"]["final_intent"] == "create_lead"
        assert payload["data"]["lead"]["company_name"] == "第四批北方能源"


def test_lead_creation_context_requires_explicit_session_id():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        assistant_session = get_or_create_assistant_session(session, user.id, LEAD_CREATION_SCENE)
        save_assistant_session_draft(
            session,
            assistant_session,
            build_lead_creation_draft(
                {
                    "company_name": "历史草稿公司",
                    "contacts": [{"name": "张三", "phone": "13800000011"}],
                }
            ),
            status="active",
        )

        assert get_lead_creation_context(session, user.id, None) is None
        context = get_lead_creation_context(session, user.id, assistant_session.id)
        assert context is not None
        assert context["session_id"] == assistant_session.id
        assert context["draft"]["company_name"] == "历史草稿公司"


def test_assistant_message_returns_usage_meta_for_openai_direct(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000031",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "result": {
                    "intent": "list_leads",
                    "reply": "",
                    "confidence": 0.91,
                    "slots": {
                        "company_name": "华北科技",
                        "region": "",
                        "status": "",
                    },
                    "next_action": "call_skill",
                    "target_id": None,
                },
                "usage_meta": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "prompt_tokens": 111,
                    "completion_tokens": 22,
                    "total_tokens": 133,
                    "latency_ms": 456,
                    "llm_called": True,
                    "route_source": "openai_direct",
                    "fallback_used": False,
                    "llm_intent": "list_leads",
                },
                "error_meta": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "查询华北科技线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["data"]["leads"][0]["id"] == matching_lead.id
        assert payload["usage_meta"] == {
            "provider": "openai",
            "model": "gpt-4.1-mini",
            "prompt_tokens": 111,
            "completion_tokens": 22,
            "total_tokens": 133,
            "latency_ms": 456,
            "llm_called": True,
            "route_source": "openai_direct",
            "fallback_used": False,
            "result_kind": "lead_list",
            "http_status": None,
            "finish_reason": "",
            "llm_intent": "list_leads",
            "final_intent": "list_leads",
        }


def test_assistant_message_marks_fallback_usage_meta_when_api_key_missing(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="sales01", name="销售一号")
        matching_lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000041",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "result": None,
                "usage_meta": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "llm_called": False,
                },
                "error_meta": {
                    "type": "MissingApiKey",
                    "message": "OPENAI_API_KEY not configured",
                },
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={
                    "message": "我的线索",
                    "context": {},
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["result_kind"] == "lead_list"
        assert payload["data"]["leads"][0]["id"] == matching_lead.id
        assert payload["usage_meta"] == {
            "provider": "openai",
            "model": "gpt-4.1-mini",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "latency_ms": 0,
            "llm_called": False,
            "route_source": "llm_skipped_no_api_key",
            "fallback_used": True,
            "result_kind": "lead_list",
            "http_status": None,
            "finish_reason": "",
            "llm_intent": "list_leads",
            "final_intent": "list_leads",
        }


def test_ai_monitor_token_endpoints_read_assistant_run_logs(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000051",
        )

        async def fake_try_openai_assistant(message: str, *, context=None):
            return {
                "result": {
                    "intent": "list_leads",
                    "reply": "",
                    "confidence": 0.9,
                    "slots": {"company_name": "华北科技"},
                    "next_action": "call_skill",
                },
                "usage_meta": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "total_tokens": 120,
                    "latency_ms": 300,
                    "llm_called": True,
                    "route_source": "openai_direct",
                    "fallback_used": False,
                    "llm_intent": "list_leads",
                },
                "error_meta": None,
            }

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_monitor_test_app(session, user)

        with TestClient(app) as client:
            response = client.post("/api/v1/assistant/message", json={"message": "查询华北科技线索"})
            assert response.status_code == 200
            assert response.json()["data"]["leads"][0]["id"] == lead.id

            summary = client.get("/api/v1/admin/ai-monitor/token/summary?date_from=2000-01-01&date_to=2099-01-01")
            cases = client.get("/api/v1/admin/ai-monitor/token/cases?date_from=2000-01-01&date_to=2099-01-01")

        run_log = session.exec(select(AiAssistantRunLog)).first()
        assert run_log is not None
        assert run_log.final_intent == "list_leads"
        assert run_log.total_tokens == 120
        assert run_log.input_excerpt == "查询华北科技线索"
        assert summary.status_code == 200
        assert summary.json()["total_request_count"] == 1
        assert summary.json()["avg_total_tokens"] == 120
        assert cases.status_code == 200
        assert cases.json()["items"][0]["session_id"] == run_log.session_id


def test_ai_monitor_token_route_sources_returns_real_distribution(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000052",
        )

        responses = [
            {
                "result": {
                    "intent": "list_leads",
                    "reply": "",
                    "confidence": 0.9,
                    "slots": {"company_name": "华北科技"},
                    "next_action": "call_skill",
                },
                "usage_meta": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "total_tokens": 120,
                    "latency_ms": 300,
                    "llm_called": True,
                    "route_source": "openai_direct",
                    "fallback_used": False,
                    "llm_intent": "list_leads",
                },
                "error_meta": None,
            },
            {
                "result": None,
                "usage_meta": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini",
                    "llm_called": False,
                },
                "error_meta": {
                    "type": "MissingApiKey",
                    "message": "OPENAI_API_KEY not configured",
                },
            },
        ]

        async def fake_try_openai_assistant(message: str, *, context=None):
            return responses.pop(0)

        monkeypatch.setattr(assistant_router_module, "try_openai_assistant", fake_try_openai_assistant)
        app = _build_monitor_test_app(session, user)

        with TestClient(app) as client:
            first = client.post("/api/v1/assistant/message", json={"message": "查询华北科技线索"})
            second = client.post("/api/v1/assistant/message", json={"message": "我的线索"})
            route_sources = client.get(
                "/api/v1/admin/ai-monitor/token/route-sources?date_from=2000-01-01&date_to=2099-01-01",
            )

        assert first.status_code == 200
        assert second.status_code == 200
        assert route_sources.status_code == 200
        payload = route_sources.json()
        assert payload["total"] == 2
        route_map = {item["route_source"]: item for item in payload["items"]}
        assert route_map["openai_direct"]["count"] == 1
        assert route_map["llm_skipped_no_api_key"]["count"] == 1
        assert route_map["openai_direct"]["rate"] == 50.0
        assert route_map["llm_skipped_no_api_key"]["rate"] == 50.0


def test_ai_monitor_normalizes_empty_route_source_for_error_records():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        app = _build_monitor_test_app(session, user)

        session.add(
            AiAssistantRunLog(
                session_id="S-ERROR-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="错误请求",
                assistant_message_excerpt="线索已转过客户",
                llm_called=False,
                route_source="",
                fallback_used=False,
                llm_intent="",
                final_intent="error",
                result_kind="message",
                action_type="error",
                result="失败",
            )
        )
        session.commit()

        with TestClient(app) as client:
            route_sources = client.get(
                "/api/v1/admin/ai-monitor/token/route-sources?date_from=2000-01-01&date_to=2099-01-01",
            )
            cases = client.get(
                "/api/v1/admin/ai-monitor/token/cases?date_from=2000-01-01&date_to=2099-01-01",
            )
            detail = client.get("/api/v1/admin/ai-monitor/token/sessions/S-ERROR-1")
            audit_actions = client.get(
                "/api/v1/admin/ai-monitor/audit/actions?date_from=2000-01-01&date_to=2099-01-01&search=S-ERROR-1",
            )

        assert route_sources.status_code == 200
        route_map = {item["route_source"]: item for item in route_sources.json()["items"]}
        assert route_map["fallback_after_error"]["count"] == 1
        assert cases.status_code == 200
        assert cases.json()["items"][0]["route_source"] == "fallback_after_error"
        assert detail.status_code == 200
        assert detail.json()["route_source"] == "fallback_after_error"
        assert audit_actions.status_code == 200
        assert audit_actions.json()["items"][0]["route_source"] == "fallback_after_error"


def test_ai_monitor_token_fallback_breakdown_splits_guardrail_and_model_recovery():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        app = _build_monitor_test_app(session, user)

        session.add(
            AiAssistantRunLog(
                session_id="S-GUARD-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="把这条线索转成客户",
                assistant_message_excerpt="请确认是否执行转客户",
                llm_called=False,
                route_source="fallback_after_unknown",
                fallback_used=True,
                llm_intent="unknown",
                final_intent="convert_lead",
                result_kind="draft_action",
                action_type="convert_lead",
                confirm_required=True,
                confirm_status="pending",
                result="待确认",
            )
        )
        session.add(
            AiAssistantRunLog(
                session_id="S-CUSTOMER-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="我的客户",
                assistant_message_excerpt="为您找到客户列表",
                llm_called=True,
                route_source="fallback_after_unknown",
                fallback_used=True,
                llm_intent="unknown",
                final_intent="list_customers",
                result_kind="customer_list",
                action_type="list_customers",
                result="成功",
            )
        )
        session.add(
            AiAssistantRunLog(
                session_id="S-ERROR-2",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="查询线索",
                assistant_message_excerpt="接口异常，已本地补救",
                llm_called=False,
                route_source="fallback_after_error",
                fallback_used=True,
                llm_intent="",
                final_intent="list_leads",
                result_kind="lead_list",
                action_type="list_leads",
                result="成功",
            )
        )
        session.commit()

        with TestClient(app) as client:
            response = client.get(
                "/api/v1/admin/ai-monitor/token/fallback-breakdown?date_from=2000-01-01&date_to=2099-01-01",
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 3
        reason_map = {item["reason"]: item for item in payload["items"]}
        assert reason_map["high_risk_guardrail"]["count"] == 1
        assert reason_map["model_unknown_recovery"]["count"] == 1
        assert reason_map["model_error_recovery"]["count"] == 1


def test_ai_monitor_processing_modes_keep_confirm_flow_out_of_model_recovery():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        app = _build_monitor_test_app(session, user)

        session.add(
            AiAssistantRunLog(
                session_id="S-DIRECT-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="我的客户",
                assistant_message_excerpt="客户列表",
                llm_called=True,
                route_source="openai_direct",
                fallback_used=False,
                llm_intent="list_customers",
                final_intent="list_customers",
                result_kind="customer_list",
                action_type="list_customers",
                total_tokens=520,
                result="成功",
            )
        )
        session.add(
            AiAssistantRunLog(
                session_id="S-UNKNOWN-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="我的客户",
                assistant_message_excerpt="客户列表",
                llm_called=True,
                route_source="fallback_after_unknown",
                fallback_used=True,
                llm_intent="unknown",
                final_intent="list_customers",
                result_kind="customer_list",
                action_type="list_customers",
                total_tokens=530,
                result="成功",
            )
        )
        session.add(
            AiAssistantRunLog(
                session_id="S-CONFIRM-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="把这条线索转成客户",
                assistant_message_excerpt="请确认是否执行转客户",
                llm_called=False,
                route_source="fallback_after_unknown",
                fallback_used=True,
                llm_intent="unknown",
                final_intent="convert_lead",
                result_kind="draft_action",
                action_type="convert_lead",
                confirm_required=True,
                confirm_status="pending",
                result="待确认",
            )
        )
        session.add(
            AiAssistantRunLog(
                session_id="S-CONFIRM-1",
                turn_no=2,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="确认执行",
                assistant_message_excerpt="转客户成功",
                llm_called=False,
                route_source="confirm_action",
                fallback_used=False,
                llm_intent="",
                final_intent="convert_lead",
                result_kind="customer_created",
                action_type="convert_lead",
                confirm_required=True,
                confirm_status="confirmed",
                write_applied=True,
                result="成功",
            )
        )
        session.commit()

        with TestClient(app) as client:
            processing_modes = client.get(
                "/api/v1/admin/ai-monitor/token/processing-modes?date_from=2000-01-01&date_to=2099-01-01",
            )
            summary = client.get("/api/v1/admin/ai-monitor/token/summary?date_from=2000-01-01&date_to=2099-01-01")
            cases = client.get("/api/v1/admin/ai-monitor/token/cases?date_from=2000-01-01&date_to=2099-01-01")

        assert processing_modes.status_code == 200
        mode_map = {item["processing_mode"]: item for item in processing_modes.json()["items"]}
        assert mode_map["model_direct"]["count"] == 1
        assert mode_map["model_unknown_recovery"]["count"] == 1
        assert mode_map["pending_confirm"]["count"] == 1
        assert mode_map["confirmed_execution"]["count"] == 1
        assert summary.status_code == 200
        assert summary.json()["model_recovery_rate"] == 25.0
        assert cases.status_code == 200
        case_modes = {item["session_id"]: item["processing_mode"] for item in cases.json()["items"]}
        assert case_modes["S-DIRECT-1"] == "model_direct"
        assert case_modes["S-UNKNOWN-1"] == "model_unknown_recovery"


def test_token_session_detail_returns_linked_action_summaries():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        app = _build_monitor_test_app(session, user)

        session.add(
            AiAssistantRunLog(
                session_id="S-LINK-1",
                turn_no=1,
                user_id=user.id,
                user_name=user.name,
                user_role=user.role,
                input_excerpt="创建线索请求",
                assistant_message_excerpt="创建成功",
                llm_called=True,
                route_source="openai_direct",
                fallback_used=False,
                llm_intent="create_lead",
                final_intent="create_lead",
                result_kind="lead_created",
                action_type="create_lead",
                total_tokens=666,
                latency_ms=1200,
                write_applied=True,
                risk_level="中",
                result="成功",
            )
        )
        session.commit()

        with TestClient(app) as client:
            detail = client.get("/api/v1/admin/ai-monitor/token/sessions/S-LINK-1")

        assert detail.status_code == 200
        payload = detail.json()
        assert payload["linked_action_ids"] == ["AI-1"]
        assert len(payload["linked_actions"]) == 1
        assert payload["linked_actions"][0]["action_id"] == "AI-1"
        assert payload["linked_actions"][0]["action_type"] == "create_lead"
        assert payload["linked_actions"][0]["write_applied"] is True


def test_ai_monitor_audit_detail_includes_write_effect_for_confirm_convert():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000061",
        )
        app = _build_monitor_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={"confirm_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}}},
            )
            assert response.status_code == 200

            run_log = session.exec(select(AiAssistantRunLog).where(AiAssistantRunLog.action_type == "convert_lead")).first()
            assert run_log is not None

            detail = client.get(f"/api/v1/admin/ai-monitor/audit/actions/AI-{run_log.id}")

        assert detail.status_code == 200
        payload = detail.json()
        assert payload["action_type"] == "convert_lead"
        assert payload["write_applied"] is True
        assert payload["confirm_status"] == "confirmed"
        assert {item["object_type"] for item in payload["write_effect"]} >= {"Lead", "Customer"}


def test_ai_monitor_audit_object_actions_can_trace_customer_write_effect():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        user = _create_user(session, login="admin01", name="系统管理员", role=ROLE_ADMIN)
        lead = _create_lead(
            session,
            company_name="华北科技",
            owner_id=user.id,
            region="华北",
            status="跟进中",
            phone="13800000071",
        )
        app = _build_monitor_test_app(session, user)

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/assistant/message",
                json={"confirm_action": {"kind": "convert_lead", "payload": {"lead_id": lead.id}}},
            )
            assert response.status_code == 200
            customer_id = response.json()["data"]["customer"]["id"]

            customer_actions = client.get(
                f"/api/v1/admin/ai-monitor/audit/object-actions?object_type=Customer&object_id={customer_id}&date_from=2000-01-01&date_to=2099-01-01",
            )
            lead_actions = client.get(
                f"/api/v1/admin/ai-monitor/audit/object-actions?object_type=Lead&object_id={lead.id}&date_from=2000-01-01&date_to=2099-01-01",
            )

        assert customer_actions.status_code == 200
        assert customer_actions.json()["total"] == 1
        assert customer_actions.json()["items"][0]["executed_action"] == "convert_lead"
        assert lead_actions.status_code == 200
        assert lead_actions.json()["total"] == 1
        assert lead_actions.json()["items"][0]["executed_action"] == "convert_lead"
