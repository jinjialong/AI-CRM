from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    login: str
    password: str


class LeadContactInput(BaseModel):
    name: str
    job_title: str = ""
    phone: str
    wechat: str = ""
    is_primary: bool = False


class LeadCreateRequest(BaseModel):
    company_name: str
    organization_code: str = ""
    region: str = ""
    source: str = "自然流量"
    owner_id: Optional[int] = None
    notes: str = ""
    contacts: list[LeadContactInput] = Field(default_factory=list)


class LeadUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    organization_code: Optional[str] = None
    region: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    owner_id: Optional[int] = None
    notes: Optional[str] = None
    contacts: Optional[list[LeadContactInput]] = None


class FollowUpCreateRequest(BaseModel):
    method: str
    content: str
    follow_up_time: Optional[datetime] = None
    next_follow_up_time: Optional[datetime] = None
    opportunity_id: Optional[int] = None


class AssignLeadRequest(BaseModel):
    owner_id: int


class ConvertLeadRequest(BaseModel):
    confirm: bool = Field(default=False)


class CustomerUpdateRequest(BaseModel):
    customer_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None


class ContactCreateRequest(BaseModel):
    name: str
    phone: str
    job_title: str = ""
    wechat: str = ""
    email: str = ""
    is_primary: bool = False
    notes: str = ""


class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    wechat: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[bool] = None
    notes: Optional[str] = None


class VisitCreateRequest(BaseModel):
    visit_time: Optional[datetime] = None
    visit_method: str
    participants: str = ""
    content: str
    conclusion: str = ""
    next_plan: str = ""
    opportunity_id: Optional[int] = None


class VisitUpdateRequest(BaseModel):
    visit_time: Optional[datetime] = None
    visit_method: Optional[str] = None
    participants: Optional[str] = None
    content: Optional[str] = None
    conclusion: Optional[str] = None
    next_plan: Optional[str] = None
    opportunity_id: Optional[int] = None


class CommunicationNoteCreateRequest(BaseModel):
    communication_time: Optional[datetime] = None
    method: str
    counterpart: str
    content: str
    todo_items: str = ""
    opportunity_id: Optional[int] = None


class CommunicationNoteUpdateRequest(BaseModel):
    communication_time: Optional[datetime] = None
    method: Optional[str] = None
    counterpart: Optional[str] = None
    content: Optional[str] = None
    todo_items: Optional[str] = None
    opportunity_id: Optional[int] = None


class LeadConversationCreateRequest(BaseModel):
    source_type: str
    content: str
    conversation_time: Optional[datetime] = None


class LeadKeyEventCreateRequest(BaseModel):
    event_type: str
    event_time: Optional[datetime] = None
    note: str = ""


class OpportunityCreateRequest(BaseModel):
    source_lead_id: Optional[int] = None
    name: str
    amount: Optional[float] = None
    stage: str = "初步接触"
    status: str = "进行中"
    expected_close_date: Optional[date] = None
    owner_id: int
    notes: str = ""


class OpportunityUpdateRequest(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    expected_close_date: Optional[date] = None
    owner_id: Optional[int] = None
    notes: Optional[str] = None


class DailyReportUpsertRequest(BaseModel):
    today_work: str
    progress_result: str = ""
    issues: str = ""
    tomorrow_plan: str = ""


class ConfigUpdateRequest(BaseModel):
    value: str


class AssistantActionRequest(BaseModel):
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AssistantRequest(BaseModel):
    message: str = ""
    confirm_action: Optional[AssistantActionRequest] = None
    session_id: Optional[int] = None


class LeadCreationSkillRequest(BaseModel):
    company_name: str = ""
    organization_code: str = ""
    region: str = ""
    source: str = ""
    owner_id: Optional[int] = None
    notes: str = ""
    contacts: list[LeadContactInput] = Field(default_factory=list)
    session_id: Optional[int] = None


class SkillActionOption(BaseModel):
    kind: str
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class LeadCreationSkillResponse(BaseModel):
    status: str
    missing_fields: list[str] = Field(default_factory=list)
    duplicate_lead: Optional[dict[str, Any]] = None
    lead: Optional[dict[str, Any]] = None
    draft: dict[str, Any] = Field(default_factory=dict)
    session_id: Optional[int] = None
    available_actions: list[SkillActionOption] = Field(default_factory=list)


class LeadCreationSessionDiscardRequest(BaseModel):
    session_id: int
