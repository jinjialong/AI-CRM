from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.core.deps import get_current_user
from app.schemas import LeadCreationSessionDiscardRequest, LeadCreationSkillRequest, LeadCreationSkillResponse
from app.skills.lead_creation import discard_lead_creation_session, execute_lead_creation_skill, raise_for_invalid_skill_result
from app.models import User

router = APIRouter()


@router.post("/skills/lead-creation")
def lead_creation_skill(
    body: LeadCreationSkillRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> LeadCreationSkillResponse:
    result = execute_lead_creation_skill(
        session,
        current_user,
        body.model_dump(),
        source="智能助手",
    )
    raise_for_invalid_skill_result(result)
    return LeadCreationSkillResponse(**result)


@router.post("/skills/lead-creation/discard")
def discard_lead_creation(
    body: LeadCreationSessionDiscardRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return discard_lead_creation_session(session, current_user.id, body.session_id)
