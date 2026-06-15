# Project Notes

## Overview
- Project: `AI-CRM`
- Current phase: first release (`1.0`) already has lead, public pool, customer, and lead detail core flow
- Current planned enhancement: `1.1` is now consolidated into one requirement document covering lead-detail sales analysis, customer-opportunity relationship, and daily-report/team-view expansion
- `1.1` now also has a dedicated technical design document for direct implementation planning

## Current State
- Existing lead detail page already supports base info, contacts, follow-up records, return to pool, mark lost, and convert to customer
- Existing customer detail page already supports customer follow-up, contacts, visit records, and communication notes
- Repository currently does not yet have dedicated data objects for lead conversations, lead key events, lead analysis current state, lead analysis snapshots, daily reports, opportunities, or the new unified lead-status model extensions
- Current database initialization still relies on `SQLModel.metadata.create_all(engine)` and has no formal migration framework
- Live deployment now runs on `123.207.221.28` under `/home/ubuntu/apps/ai-crm` with PM2 apps `ai-crm-frontend` and `ai-crm-backend`

## Core Files
- Lead detail page: `src/frontend/src/app/(authenticated)/leads/[id]/page.tsx`
- Customer detail page: `src/frontend/src/app/(authenticated)/customers/[id]/page.tsx`
- Lead models: `src/backend/app/models.py`
- Lead domain logic: `src/backend/app/lead_domain.py`
- Lead router: `src/backend/app/routers/leads.py`
- 1.0 PRD: `docs/1.0/第一期产品需求文档.md`
- 1.1 requirement doc: `docs/1.1/1.1-销售分析、客户商机与日报团队视图需求文档.md`
- 1.1 PRD: `docs/1.1/1.1-销售分析、客户商机与日报团队视图PRD.md`
- 1.1 technical design: `docs/1.1/1.1-销售分析、客户商机与日报团队视图技术方案.md`

## Long-Term Constraints
- `1.1` is an enhancement to the existing CRM flow, not a rewrite of the current lead/public-pool/customer flow
- Lead-detail sales analysis remains a lead-side capability
- Opportunity is defined as a customer-level object, not a lead-level object
- Converted-lead judgment should rely on `converted_customer_id` rather than a dedicated `"已转客户"` status value
- Team views should extend the existing CRM model rather than collapse public-pool leads and owned leads into one concept
- Lead state should use one unified business status model instead of a separate `confidence_level` field
- User-facing wording should stay readable for non-expert users; Chinese explanation should take precedence over raw framework jargon
- `1.1` should not introduce heavy new infra such as microservices, Redis, or Alembic unless later phase scope changes
- Existing SQLite database should be upgraded in place; old local databases should not require manual deletion just to run 1.1
- Production sync should target `/home/ubuntu/apps/ai-crm` only and should not touch unrelated `/www/wwwroot/*` projects
- Local collaboration must treat `C:\Users\Administrator\AI编程\AICRM\AI-CRM` as the only valid repo for this project; sibling repos such as `sfa-crm-master` are not interchangeable
- Local runtime validation should use one backend instance on `127.0.0.1:8000` and one frontend instance on `127.0.0.1:3200`
- For acceptance or UI verification, prefer `npm run build` + `npm run start -- --port 3200` over `next dev` because `next dev` has previously produced stale-cache and mismatched-instance behavior

## Key Decisions
- `1.1` is now maintained as one merged requirement doc instead of multiple separate docs
- Lead-specific business logic should be consolidated in `src/backend/app/lead_domain.py` instead of staying mixed into the generic `services.py`
- Lead-detail enhancement contains 4 modules: dashboard, conversation records, trend, key events
- New analysis should use existing lead and follow-up data, plus newly added conversation and key-event data
- Trend should be based on saved analysis snapshots, not front-end temporary calculation
- Opportunity is defined as a customer-level object, not a lead-level object
- Recommended team-facing naming is split into clearer pages such as `团队概览`, `团队线索`, and `团队日报`, instead of a generic “我的团队”
- Recommended team-lead definition: team leads are leads whose current `owner` belongs to the selected team; public-pool leads remain separate
- Recommended first-version lead statuses: `跟进中`, `必胜`, `大概率`, `高风险`, `已丢弃`
- Recommended minimal team model for implementation: add `manager_id` to `User` rather than introducing a separate `Team` table in 1.1
- Recommended migration strategy for 1.1: add a startup migration module to patch existing tables and backfill status values because `create_all` alone cannot alter existing schema
- Recommended analysis strategy for 1.1: rule-first scoring with optional OpenAI enhancement for summaries and next-best-action text
- Technical design now includes direct implementation task breakdown with task ids `BE-01`..`BE-08`, `FE-01`..`FE-05`, and `QA-01`..`QA-04`
- Technical design now freezes default implementation choices for 1.1, including:
  - UI naming defaults to `销售分析` with optional `MEDDICC` helper wording
  - no forced opportunity-creation popup after lead conversion
  - no `Team` table in 1.1
  - lead status editable only on lead detail page in 1.1
  - high-risk status does not require a mandatory reason in 1.1
  - daily reports support history backfill with one report per user per date

## Open Risks
- Naming is still open: whether product UI should expose `MEDDICC` directly or use a more Chinese “销售分析” framing
- Analysis engine strategy is still open: rule-based, model-based, or hybrid
- Key-event type set and delete/edit scope still need final confirmation
- Team data model is partially resolved in tech design through `User.manager_id`, but existing data backfill and admin maintenance flow still need implementation details
- Daily-report rules still need confirmation on history backfill, export, and whether high-risk status changes require reason input
