from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import CommunicationNote, Contact, Customer, CustomerFollowUp, ROLE_ADMIN, ROLE_MANAGER, User, VisitRecord
from app.schemas import CommunicationNoteCreateRequest, ContactCreateRequest, CustomerUpdateRequest, FollowUpCreateRequest, VisitCreateRequest
from app.services import (
    ensure_customer_access,
    get_config_values,
    get_customer_or_404,
    serialize_contact,
    serialize_customer,
    serialize_customer_followup,
    serialize_note,
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
    config = get_config_values(session)
    return {
        "customer": serialize_customer(session, customer),
        "followups": [serialize_customer_followup(session, item) for item in followups],
        "contacts": [serialize_contact(item) for item in contacts],
        "visits": [serialize_visit(item) for item in visits],
        "notes": [serialize_note(item) for item in notes],
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
    followup = CustomerFollowUp(
        customer_id=customer_id,
        method=body.method,
        content=body.content,
        follow_up_time=body.follow_up_time or utcnow(),
        next_follow_up_time=body.next_follow_up_time,
        created_by_id=current_user.id,
    )
    customer.updated_at = utcnow()
    session.add(followup)
    session.add(customer)
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
    customer.updated_at = utcnow()
    session.add(contact)
    session.add(customer)
    write_audit(session, current_user, "新增联系人", "客户", str(customer.id), details=f"联系人 {body.name}")
    session.commit()
    session.refresh(contact)
    return serialize_contact(contact)


@router.post("/customers/{customer_id}/visits")
def create_visit(
    customer_id: int,
    body: VisitCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    visit = VisitRecord(
        customer_id=customer_id,
        visit_time=body.visit_time or utcnow(),
        visit_method=body.visit_method,
        participants=body.participants,
        content=body.content,
        conclusion=body.conclusion,
        next_plan=body.next_plan,
        created_by_id=current_user.id,
    )
    customer.updated_at = utcnow()
    session.add(visit)
    session.add(customer)
    write_audit(session, current_user, "新增拜访记录", "客户", str(customer.id))
    session.commit()
    session.refresh(visit)
    return serialize_visit(visit)


@router.post("/customers/{customer_id}/notes")
def create_note(
    customer_id: int,
    body: CommunicationNoteCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    customer = get_customer_or_404(session, customer_id)
    ensure_customer_access(current_user, customer)
    note = CommunicationNote(
        customer_id=customer_id,
        communication_time=body.communication_time or utcnow(),
        method=body.method,
        counterpart=body.counterpart,
        content=body.content,
        todo_items=body.todo_items,
        created_by_id=current_user.id,
    )
    customer.updated_at = utcnow()
    session.add(note)
    session.add(customer)
    write_audit(session, current_user, "新增沟通纪要", "客户", str(customer.id))
    session.commit()
    session.refresh(note)
    return serialize_note(note)

