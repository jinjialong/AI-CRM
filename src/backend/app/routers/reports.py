import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import (
    DailyReport,
    Lead,
    LeadAnalysisCurrent,
    LEAD_STATUS_DROPPED,
    LEAD_STATUS_FOLLOWING,
    LEAD_STATUS_HIGH_PROBABILITY,
    LEAD_STATUS_HIGH_RISK,
    LEAD_STATUS_MUST_WIN,
    Opportunity,
    ROLE_ADMIN,
    ROLE_MANAGER,
    User,
)
from app.schemas import DailyReportUpsertRequest
from app.services import is_converted_lead, serialize_lead, serialize_user, utcnow, write_audit

router = APIRouter()

LEAD_PROBABILITY_FALLBACK = {
    LEAD_STATUS_FOLLOWING: 35,
    LEAD_STATUS_HIGH_PROBABILITY: 75,
    LEAD_STATUS_MUST_WIN: 90,
    LEAD_STATUS_HIGH_RISK: 20,
    LEAD_STATUS_DROPPED: 0,
}


def _resolve_target_manager_id(
    session: Session,
    current_user: User,
    manager_id: int | None = None,
) -> int:
    if current_user.role == ROLE_MANAGER:
        if manager_id is not None and manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="销售经理只能查看自己的团队")
        return current_user.id

    if manager_id is not None:
        manager = session.get(User, manager_id)
        if not manager:
            raise HTTPException(status_code=404, detail="团队负责人不存在")
        return manager_id

    return current_user.id


def _team_members(session: Session, current_user: User, manager_id: int | None = None) -> list[User]:
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        raise HTTPException(status_code=403, detail="无权查看团队数据")
    target_manager_id = _resolve_target_manager_id(session, current_user, manager_id)
    statement = select(User).where(User.manager_id == target_manager_id)
    return session.exec(statement).all()


def _serialize_daily_report(item: DailyReport, user: User | None) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "user_name": user.name if user else None,
        "report_date": item.report_date,
        "today_work": item.today_work,
        "progress_result": item.progress_result,
        "issues": item.issues,
        "tomorrow_plan": item.tomorrow_plan,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _lead_probability(lead: Lead, analysis_map: dict[int, LeadAnalysisCurrent]) -> int:
    current = analysis_map.get(lead.id)
    if current:
        return current.score
    return LEAD_PROBABILITY_FALLBACK.get(lead.status, 0)


def _lead_latest_activity_at(lead: Lead, analysis_map: dict[int, LeadAnalysisCurrent]) -> datetime:
    current = analysis_map.get(lead.id)
    if current:
        payload = json.loads(current.dimension_payload or "{}")
        parsed = _parse_iso_datetime(payload.get("latest_activity_at"))
        if parsed:
            return parsed
    fallback = lead.updated_at
    if fallback.tzinfo is None:
        return fallback.replace(tzinfo=timezone.utc)
    return fallback.astimezone(timezone.utc)


@router.get("/reports/me")
def list_my_reports(
    date_from: str = "",
    date_to: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    statement = select(DailyReport).where(DailyReport.user_id == current_user.id).order_by(DailyReport.report_date.desc())
    items = session.exec(statement).all()
    if date_from:
        from_date = date.fromisoformat(date_from)
        items = [item for item in items if item.report_date >= from_date]
    if date_to:
        to_date = date.fromisoformat(date_to)
        items = [item for item in items if item.report_date <= to_date]
    return {"items": [_serialize_daily_report(item, current_user) for item in items]}


@router.put("/reports/me/{report_date}")
def upsert_my_report(
    report_date: date,
    body: DailyReportUpsertRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    item = session.exec(
        select(DailyReport).where(DailyReport.user_id == current_user.id, DailyReport.report_date == report_date)
    ).first()
    is_new = item is None
    if not item:
        item = DailyReport(
            user_id=current_user.id,
            report_date=report_date,
            today_work=body.today_work,
            progress_result=body.progress_result,
            issues=body.issues,
            tomorrow_plan=body.tomorrow_plan,
        )
    else:
        item.today_work = body.today_work
        item.progress_result = body.progress_result
        item.issues = body.issues
        item.tomorrow_plan = body.tomorrow_plan
        item.updated_at = utcnow()
    session.add(item)
    write_audit(session, current_user, "提交日报" if is_new else "更新日报", "日报", str(current_user.id), details=str(report_date))
    session.commit()
    session.refresh(item)
    return _serialize_daily_report(item, current_user)


@router.delete("/reports/me/{report_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_report(
    report_date: date,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    item = session.exec(
        select(DailyReport).where(DailyReport.user_id == current_user.id, DailyReport.report_date == report_date)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="日报不存在")
    session.delete(item)
    write_audit(session, current_user, "删除日报", "日报", str(current_user.id), details=str(report_date))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/team/members")
def list_team_members(
    manager_id: int | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    members = _team_members(session, current_user, manager_id)
    return {"items": [serialize_user(item) for item in members]}


@router.get("/team/daily-reports")
def list_team_daily_reports(
    report_date: date,
    manager_id: int | None = None,
    member_id: int | None = None,
    completion_status: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    members = _team_members(session, current_user, manager_id)
    if member_id:
        member_ids = {item.id for item in members}
        if member_id not in member_ids:
            raise HTTPException(status_code=400, detail="成员不在当前团队范围内")
        members = [item for item in members if item.id == member_id]
    member_ids = {item.id for item in members}
    reports = session.exec(select(DailyReport).where(DailyReport.report_date == report_date)).all()
    report_map = {item.user_id: item for item in reports if item.user_id in member_ids}
    rows = []
    for member in members:
        report = report_map.get(member.id)
        completed = report is not None
        if completion_status == "done" and not completed:
            continue
        if completion_status == "pending" and completed:
            continue
        rows.append(
            {
                "member": serialize_user(member),
                "completed": completed,
                "report": _serialize_daily_report(report, member) if report else None,
            }
        )
    return {"items": rows}


@router.get("/team/overview")
def get_team_overview(
    manager_id: int | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    target_manager_id = _resolve_target_manager_id(session, current_user, manager_id)
    members = _team_members(session, current_user, target_manager_id)
    member_ids = {item.id for item in members}
    leads = session.exec(select(Lead)).all()
    team_leads = [item for item in leads if item.owner_id in member_ids and not is_converted_lead(item)]
    team_lead_ids = {item.id for item in team_leads}
    analyses = session.exec(select(LeadAnalysisCurrent)).all()
    analysis_map = {item.lead_id: item for item in analyses if item.lead_id in team_lead_ids}
    opportunities = session.exec(select(Opportunity)).all()
    member_opportunities = [
        item for item in opportunities if item.owner_id in member_ids and item.status == "进行中"
    ]
    today = utcnow().date()
    reports = session.exec(select(DailyReport).where(DailyReport.report_date == today)).all()
    completed_user_ids = {item.user_id for item in reports if item.user_id in member_ids}
    leads_by_member_id = {
        member.id: [item for item in team_leads if item.owner_id == member.id]
        for member in members
    }
    opportunities_by_member_id = {
        member.id: [item for item in member_opportunities if item.owner_id == member.id]
        for member in members
    }

    lead_rows = []
    for lead in team_leads:
        serialized = serialize_lead(session, lead)
        lead_rows.append(
            {
                **serialized,
                "probability": _lead_probability(lead, analysis_map),
                "latest_activity_at": _lead_latest_activity_at(lead, analysis_map),
            }
        )
    lead_rows.sort(key=lambda item: item["latest_activity_at"], reverse=True)

    member_summaries = [
        {
            "member": serialize_user(member),
            "lead_count": len(leads_by_member_id[member.id]),
            "report_completed": member.id in completed_user_ids,
            "average_probability": round(
                sum(_lead_probability(item, analysis_map) for item in leads_by_member_id[member.id])
                / len(leads_by_member_id[member.id])
            )
            if len(leads_by_member_id[member.id])
            else 0,
            "potential_amount": round(
                sum((item.amount or 0) for item in opportunities_by_member_id[member.id]),
                2,
            ),
            "latest_activity_at": max(
                (_lead_latest_activity_at(item, analysis_map) for item in leads_by_member_id[member.id]),
                default=None,
            ),
        }
        for member in sorted(members, key=lambda item: item.name)
    ]
    member_summaries.sort(
        key=lambda item: (
            item["lead_count"],
            item["average_probability"],
            item["latest_activity_at"] or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )
    return {
        "team_manager_id": target_manager_id,
        "team_member_count": len(members),
        "lead_count": len(team_leads),
        "status_counts": {
            LEAD_STATUS_FOLLOWING: len([item for item in team_leads if item.status == LEAD_STATUS_FOLLOWING]),
            LEAD_STATUS_MUST_WIN: len([item for item in team_leads if item.status == LEAD_STATUS_MUST_WIN]),
            LEAD_STATUS_HIGH_PROBABILITY: len(
                [item for item in team_leads if item.status == LEAD_STATUS_HIGH_PROBABILITY]
            ),
            LEAD_STATUS_HIGH_RISK: len([item for item in team_leads if item.status == LEAD_STATUS_HIGH_RISK]),
            LEAD_STATUS_DROPPED: len([item for item in team_leads if item.status == LEAD_STATUS_DROPPED]),
        },
        "report_done_count": len(completed_user_ids),
        "report_pending_count": max(len(members) - len(completed_user_ids), 0),
        "lead_rows": lead_rows,
        "member_summaries": member_summaries,
    }


@router.get("/team/leads")
def list_team_leads(
    manager_id: int | None = None,
    member_id: int | None = None,
    region: str = "",
    status: str = "",
    search: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    members = _team_members(session, current_user, manager_id)
    member_ids = {item.id for item in members}
    if member_id:
        if member_id not in member_ids:
            raise HTTPException(status_code=400, detail="成员不在当前团队范围内")
        member_ids = {member_id}
    items = session.exec(select(Lead)).all()
    rows = [item for item in items if item.owner_id in member_ids and not is_converted_lead(item)]
    if region:
        rows = [item for item in rows if item.region == region]
    if status:
        rows = [item for item in rows if item.status == status]
    serialized = [serialize_lead(session, item) for item in rows]
    if search:
        serialized = [
            item
            for item in serialized
            if search in item["company_name"]
            or search in item["organization_code"]
            or search in item["primary_contact_name"]
        ]
    serialized.sort(key=lambda item: item["updated_at"], reverse=True)
    return {"items": serialized}
