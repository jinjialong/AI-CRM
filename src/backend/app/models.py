from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


ROLE_SALES = "销售"
ROLE_MANAGER = "销售经理"
ROLE_ADMIN = "系统管理员"

LEAD_STATUS_FOLLOWING = "跟进中"
LEAD_STATUS_MUST_WIN = "必胜"
LEAD_STATUS_HIGH_PROBABILITY = "大概率"
LEAD_STATUS_HIGH_RISK = "高风险"
LEAD_STATUS_DROPPED = "已丢弃"

LEGACY_LEAD_STATUS_INVALID = "无效"
LEGACY_LEAD_STATUS_CONVERTED = "已转客户"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    login: str = Field(index=True, unique=True)
    name: str
    role: str = Field(index=True)
    manager_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    password_hash: str
    active: bool = True
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class Lead(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company_name: str = Field(index=True)
    organization_code: str = Field(default="", index=True)
    region: str = Field(default="", index=True)
    source: str = Field(default="自然流量", index=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    status: str = Field(default=LEAD_STATUS_FOLLOWING, index=True)
    is_public: bool = Field(default=False, index=True)
    notes: str = ""
    converted_customer_id: Optional[int] = Field(default=None, foreign_key="customer.id")
    converted_at: Optional[datetime] = None
    converted_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    last_pool_at: Optional[datetime] = None
    last_claimed_at: Optional[datetime] = None
    last_assigned_at: Optional[datetime] = None
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadContact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    name: str
    job_title: str = ""
    phone: str = Field(default="", index=True)
    wechat: str = ""
    is_primary: bool = False
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadFollowUp(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    method: str
    content: str
    follow_up_time: datetime = Field(default_factory=utcnow, nullable=False)
    next_follow_up_time: Optional[datetime] = None
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class Customer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_name: str
    source_lead_id: int = Field(foreign_key="lead.id", index=True)
    contact_name: str
    phone: str = Field(index=True)
    company_name: str = ""
    owner_id: int = Field(foreign_key="user.id", index=True)
    notes: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class CustomerFollowUp(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.id", index=True)
    opportunity_id: Optional[int] = Field(default=None, foreign_key="opportunity.id", index=True)
    method: str
    content: str
    follow_up_time: datetime = Field(default_factory=utcnow, nullable=False)
    next_follow_up_time: Optional[datetime] = None
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class Contact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.id", index=True)
    name: str
    phone: str
    job_title: str = ""
    wechat: str = ""
    email: str = ""
    is_primary: bool = False
    notes: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class VisitRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.id", index=True)
    opportunity_id: Optional[int] = Field(default=None, foreign_key="opportunity.id", index=True)
    visit_time: datetime = Field(default_factory=utcnow, nullable=False)
    visit_method: str
    participants: str = ""
    content: str
    conclusion: str = ""
    next_plan: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class CommunicationNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.id", index=True)
    opportunity_id: Optional[int] = Field(default=None, foreign_key="opportunity.id", index=True)
    communication_time: datetime = Field(default_factory=utcnow, nullable=False)
    method: str
    counterpart: str
    content: str
    todo_items: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class ConfigItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: str
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: Optional[int] = Field(default=None, foreign_key="user.id")
    actor_name: str
    actor_role: str
    action: str
    target_type: str
    target_id: str
    result: str
    source: str = "页面"
    details: str = ""
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class AssistantSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    scene: str = Field(index=True)
    status: str = Field(default="active", index=True)
    draft_payload: str = Field(default="{}")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadConversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    source_type: str = Field(index=True)
    content: str
    conversation_time: datetime = Field(default_factory=utcnow, nullable=False, index=True)
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadKeyEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    event_type: str = Field(index=True)
    event_time: datetime = Field(default_factory=utcnow, nullable=False, index=True)
    note: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadAnalysisCurrent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True, unique=True)
    score: int = 0
    completed_dimension_count: int = 0
    total_dimension_count: int = 7
    dimension_payload: str = Field(default="{}")
    next_best_action: str = ""
    analysis_version: str = "v1-rule"
    raw_payload: str = Field(default="{}")
    analyzed_at: datetime = Field(default_factory=utcnow, nullable=False)
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class LeadAnalysisSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    score: int = 0
    completed_dimension_count: int = 0
    total_dimension_count: int = 7
    snapshot_payload: str = Field(default="{}")
    analyzed_at: datetime = Field(default_factory=utcnow, nullable=False, index=True)
    created_at: datetime = Field(default_factory=utcnow, nullable=False)


class Opportunity(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.id", index=True)
    source_lead_id: Optional[int] = Field(default=None, foreign_key="lead.id", index=True)
    name: str
    amount: Optional[float] = None
    stage: str = Field(default="初步接触", index=True)
    status: str = Field(default="进行中", index=True)
    expected_close_date: Optional[date] = None
    owner_id: int = Field(foreign_key="user.id", index=True)
    notes: str = ""
    created_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class DailyReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    report_date: date = Field(index=True)
    today_work: str
    progress_result: str
    issues: str = ""
    tomorrow_plan: str
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)
