from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import (
    CommunicationNote,
    Contact,
    Customer,
    CustomerFollowUp,
    Opportunity,
    ROLE_ADMIN,
    ROLE_MANAGER,
    User,
    VisitRecord,
)
from app.schemas import (
    CommunicationNoteCreateRequest,
    CommunicationNoteUpdateRequest,
    ContactCreateRequest,
    ContactUpdateRequest,
    CustomerUpdateRequest,
    FollowUpCreateRequest,
    OpportunityCreateRequest,
    OpportunityUpdateRequest,
    VisitCreateRequest,
    VisitUpdateRequest,
)
from app.services import (
    ensure_customer_access,
    get_config_values,
    get_customer_or_404,
    get_opportunity_or_404,
    get_user_or_404,
    serialize_contact,
    serialize_customer,
    serialize_customer_followup,
    serialize_note,
    serialize_opportunity,
    serialize_visit,
    split_config_value,
    update_model,
    utcnow,
    write_audit,
)

router = APIRouter()


def _visible_customers(session: Session, current_user: User):
    statement = select(Customer)
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        statement = statement.where(Customer.owner_id == current_user.id)
    return session.exec(statement).all()


def _touch_customer(session: Session, customer: Customer) -> None:
    customer.updated_at = utcnow()
    session.add(customer)


def _get_contact_or_404(session: Session, contact_id: int) -> Contact:
    item = session.get(Contact, contact_id)
    if not item:
        raise HTTPException(status_code=404, detail="联系人不存在")
    return item


def _get_visit_or_404(session: Session, visit_id: int) -> VisitRecord:
    item = session.get(VisitRecord, visit_id)
    if not item:
        raise HTTPException(status_code=404, detail="拜访记录不存在")
    return item


def _get_note_or_404(session: Session, note_id: int) -> CommunicationNote:
    item = session.get(CommunicationNote, note_id)
    if not item:
        raise HTTPException(status_code=404, detail="沟通纪要不存在")
    return item


def _validate_customer_opportunity(
    session: Session,
    customer_id: int,
    opportunity_id: int | None,
) -> None:
    if opportunity_id is None:
        return
    opportunity = get_opportunity_or_404(session, opportunity_id)
    if opportunity.customer_id != customer_id:
        raise HTTPException(status_code=400, detail="商机不属于当前客户")


@router.get("/customers")
def list_customers(
    search: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customers = _visible_customers(session, current_user)
    if search:
        customers = [
            customer
            for customer in customers
            if search in customer.customer_name or search in customer.contact_name or search in customer.phone
        ]
    customers.sort(key=lambda item: item.updated_at, reverse=True)
    return {"items": [serialize_customer(session, customer) for customer in customers]}


@router.get("/customers/{customer_id}")
def get_customer(
    customer_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    followups = session.exec(
        select(CustomerFollowUp)
        .where(CustomerFollowUp.customer_id == customer_id)
        .order_by(CustomerFollowUp.created_at.desc())
    ).all()
    contacts = session.exec(select(Contact).where(Contact.customer_id == customer_id).order_by(Contact.created_at.desc())).all()
    visits = session.exec(
        select(VisitRecord).where(VisitRecord.customer_id == customer_id).order_by(VisitRecord.created_at.desc())
    ).all()
    notes = session.exec(
        select(CommunicationNote).where(CommunicationNote.customer_id == customer_id).order_by(CommunicationNote.created_at.desc())
    ).all()
    opportunities = session.exec(
        select(Opportunity).where(Opportunity.customer_id == customer_id).order_by(Opportunity.created_at.desc())
    ).all()
    config = get_config_values(session)
    return {
        "customer": serialize_customer(session, customer),
        "followups": [serialize_customer_followup(session, item) for item in followups],
        "contacts": [serialize_contact(item) for item in contacts],
        "visits": [serialize_visit(item) for item in visits],
        "notes": [serialize_note(item) for item in notes],
        "opportunities": [serialize_opportunity(session, item) for item in opportunities],
        "followup_methods": split_config_value(config.get("followup_methods", "电话,微信,面谈,其他")),
    }


@router.patch("/customers/{customer_id}")
def update_customer(
    customer_id: int,
    body: CustomerUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    update_model(customer, body.model_dump(exclude_none=True))
    customer.updated_at = utcnow()
    session.add(customer)
    write_audit(session, current_user, "编辑客户信息", "客户", str(customer.id))
    session.commit()
    session.refresh(customer)
    return serialize_customer(session, customer)


@router.post("/customers/{customer_id}/followups")
def create_customer_followup(
    customer_id: int,
    body: FollowUpCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    _validate_customer_opportunity(session, customer_id, body.opportunity_id)
    followup = CustomerFollowUp(
        customer_id=customer_id,
        opportunity_id=body.opportunity_id,
        method=body.method,
        content=body.content,
        follow_up_time=body.follow_up_time or utcnow(),
        next_follow_up_time=body.next_follow_up_time,
        created_by_id=current_user.id,
    )
    _touch_customer(session, customer)
    session.add(followup)
    write_audit(session, current_user, "新增客户跟进", "客户", str(customer.id))
    session.commit()
    session.refresh(followup)
    return serialize_customer_followup(session, followup)


@router.post("/customers/{customer_id}/contacts")
def create_contact(
    customer_id: int,
    body: ContactCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    contact = Contact(customer_id=customer_id, created_by_id=current_user.id, **body.model_dump())
    _touch_customer(session, customer)
    session.add(contact)
    write_audit(session, current_user, "新增联系人", "客户", str(customer.id), details=f"联系人:{body.name}")
    session.commit()
    session.refresh(contact)
    return serialize_contact(contact)


@router.patch("/contacts/{contact_id}")
def update_contact(
    contact_id: int,
    body: ContactUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    contact = _get_contact_or_404(session, contact_id)
    customer = get_customer_or_404(session, contact.customer_id)
    ensure_customer_access(current_user, customer)
    update_model(contact, body.model_dump(exclude_none=True))
    _touch_customer(session, customer)
    session.add(contact)
    write_audit(session, current_user, "编辑联系人", "客户", str(customer.id), details=f"联系人:{contact.name}")
    session.commit()
    session.refresh(contact)
    return serialize_contact(contact)


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    contact = _get_contact_or_404(session, contact_id)
    customer = get_customer_or_404(session, contact.customer_id)
    ensure_customer_access(current_user, customer)
    _touch_customer(session, customer)
    session.delete(contact)
    write_audit(session, current_user, "删除联系人", "客户", str(customer.id), details=f"联系人:{contact.name}")
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/customers/{customer_id}/visits")
def create_visit(
    customer_id: int,
    body: VisitCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    _validate_customer_opportunity(session, customer_id, body.opportunity_id)
    visit = VisitRecord(
        customer_id=customer_id,
        opportunity_id=body.opportunity_id,
        visit_time=body.visit_time or utcnow(),
        visit_method=body.visit_method,
        participants=body.participants,
        content=body.content,
        conclusion=body.conclusion,
        next_plan=body.next_plan,
        created_by_id=current_user.id,
    )
    _touch_customer(session, customer)
    session.add(visit)
    write_audit(session, current_user, "新增拜访记录", "客户", str(customer.id))
    session.commit()
    session.refresh(visit)
    return serialize_visit(visit)


@router.patch("/visits/{visit_id}")
def update_visit(
    visit_id: int,
    body: VisitUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    visit = _get_visit_or_404(session, visit_id)
    customer = get_customer_or_404(session, visit.customer_id)
    ensure_customer_access(current_user, customer)
    payload = body.model_dump(exclude_none=True)
    if "opportunity_id" in payload:
        _validate_customer_opportunity(session, customer.id, payload["opportunity_id"])
    update_model(visit, payload)
    _touch_customer(session, customer)
    session.add(visit)
    write_audit(session, current_user, "编辑拜访记录", "客户", str(customer.id))
    session.commit()
    session.refresh(visit)
    return serialize_visit(visit)


@router.delete("/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(
    visit_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    visit = _get_visit_or_404(session, visit_id)
    customer = get_customer_or_404(session, visit.customer_id)
    ensure_customer_access(current_user, customer)
    _touch_customer(session, customer)
    session.delete(visit)
    write_audit(session, current_user, "删除拜访记录", "客户", str(customer.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/customers/{customer_id}/notes")
def create_note(
    customer_id: int,
    body: CommunicationNoteCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    _validate_customer_opportunity(session, customer_id, body.opportunity_id)
    note = CommunicationNote(
        customer_id=customer_id,
        opportunity_id=body.opportunity_id,
        communication_time=body.communication_time or utcnow(),
        method=body.method,
        counterpart=body.counterpart,
        content=body.content,
        todo_items=body.todo_items,
        created_by_id=current_user.id,
    )
    _touch_customer(session, customer)
    session.add(note)
    write_audit(session, current_user, "新增沟通纪要", "客户", str(customer.id))
    session.commit()
    session.refresh(note)
    return serialize_note(note)


@router.patch("/notes/{note_id}")
def update_note(
    note_id: int,
    body: CommunicationNoteUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = _get_note_or_404(session, note_id)
    customer = get_customer_or_404(session, note.customer_id)
    ensure_customer_access(current_user, customer)
    payload = body.model_dump(exclude_none=True)
    if "opportunity_id" in payload:
        _validate_customer_opportunity(session, customer.id, payload["opportunity_id"])
    update_model(note, payload)
    _touch_customer(session, customer)
    session.add(note)
    write_audit(session, current_user, "编辑沟通纪要", "客户", str(customer.id))
    session.commit()
    session.refresh(note)
    return serialize_note(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    note = _get_note_or_404(session, note_id)
    customer = get_customer_or_404(session, note.customer_id)
    ensure_customer_access(current_user, customer)
    _touch_customer(session, customer)
    session.delete(note)
    write_audit(session, current_user, "删除沟通纪要", "客户", str(customer.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/customers/{customer_id}/opportunities")
def list_opportunities(
    customer_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    items = session.exec(
        select(Opportunity).where(Opportunity.customer_id == customer_id).order_by(Opportunity.created_at.desc())
    ).all()
    return {"items": [serialize_opportunity(session, item) for item in items]}


@router.post("/customers/{customer_id}/opportunities")
def create_opportunity(
    customer_id: int,
    body: OpportunityCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    owner = get_user_or_404(session, body.owner_id)
    opportunity = Opportunity(
        customer_id=customer_id,
        source_lead_id=body.source_lead_id,
        name=body.name,
        amount=body.amount,
        stage=body.stage,
        status=body.status,
        expected_close_date=body.expected_close_date,
        owner_id=owner.id,
        notes=body.notes,
        created_by_id=current_user.id,
    )
    _touch_customer(session, customer)
    session.add(opportunity)
    write_audit(session, current_user, "新增商机", "客户", str(customer.id), details=body.name)
    session.commit()
    session.refresh(opportunity)
    return serialize_opportunity(session, opportunity)


@router.patch("/opportunities/{opportunity_id}")
def update_opportunity(
    opportunity_id: int,
    body: OpportunityUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    opportunity = get_opportunity_or_404(session, opportunity_id)
    customer = get_customer_or_404(session, opportunity.customer_id)
    ensure_customer_access(current_user, customer)
    payload = body.model_dump(exclude_none=True)
    owner_id = payload.pop("owner_id", None)
    expected_close_date = payload.pop("expected_close_date", None)
    if owner_id is not None:
        owner = get_user_or_404(session, owner_id)
        opportunity.owner_id = owner.id
    if expected_close_date is not None:
        opportunity.expected_close_date = expected_close_date
    update_model(opportunity, payload)
    opportunity.updated_at = utcnow()
    _touch_customer(session, customer)
    session.add(opportunity)
    write_audit(session, current_user, "编辑商机", "客户", str(customer.id), details=opportunity.name)
    session.commit()
    session.refresh(opportunity)
    return serialize_opportunity(session, opportunity)


@router.delete("/opportunities/{opportunity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_opportunity(
    opportunity_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    opportunity = get_opportunity_or_404(session, opportunity_id)
    customer = get_customer_or_404(session, opportunity.customer_id)
    ensure_customer_access(current_user, customer)
    _touch_customer(session, customer)
    session.delete(opportunity)
    write_audit(session, current_user, "删除商机", "客户", str(customer.id), details=opportunity.name)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
