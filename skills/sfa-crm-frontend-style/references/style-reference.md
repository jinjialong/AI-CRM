# SFA CRM Style Reference

Use this reference when a task needs concrete styling guidance or when you need to justify whether a proposed UI matches this style.

This file is written to be portable. It should remain understandable even after the skill is copied into a different repository.

## Style scope

This style represents a specific product language:

1. Traditional enterprise CRM shell
2. AI copilot surfaces embedded into core workflows
3. Separate desktop and mobile experiences with equivalent business actions
4. High business density with restrained visual treatment

## Product identity

The result is not design-system-heavy. It is practical, explicit, and scenario-oriented.

## Visual tokens

These values are approximate defaults extracted from repeated usage, not a formal token system.

### Neutrals

- page background: `#f0f2f5`, `#f5f7fa`, `#fafbfc`
- card background: `#ffffff`
- light border: `#e8e8e8`, `#e2e8f0`, `#f0f0f0`
- muted text: `#8c8c8c`, `#94a3b8`, `#64748b`, `#595959`
- strong text: `#262626`, `#0f172a`, `#001529`

### Brand and state colors

- primary blue: `#1890ff`
- supporting blue: `#40a9ff`, `#e6f7ff`, `#91d5ff`
- dark action/nav: `#0f172a`, `#001529`
- accent purple: `#722ed1`
- success green: `#52c41a`
- warning orange: `#fa8c16`, `#fff7ed`, `#fff1d4`
- alert red: `#ff4d4f`, `#cf1322`, `#fff1f0`
- gold/yellow metric accents: `#faad14`

## Typography

- system sans stack
- large headings are bold and compact
- body copy is practical, usually `13px` to `15px`
- labels and table headers are compact, often `11px` to `13px`
- metric numbers are much larger, often `28px` to `32px`

Avoid expressive brand fonts. This style depends on clarity, not typography personality.

## Spacing and surfaces

- page padding commonly `16px`, `20px`, `24px`, `28px`, `32px`
- inter-card gaps commonly `8px`, `12px`, `14px`, `16px`
- radii mostly `6px`, `8px`, `10px`, `12px`
- shadows are light and business-like, not cinematic

## Canonical patterns

Use these as the stable reference set when rebuilding the style in another project.

### Desktop shell

- fixed left sidebar around `220px`
- dark navy sidebar background
- content area on light gray canvas
- optional fixed right AI chat panel around `420px`

### Desktop login and onboarding

- two-column desktop login
- left side sells the product narrative and role entry points
- right side is a plain operational login card
- onboarding callouts use warm background, orange border accents, and short scenario cards

### Desktop data pages

- metric cards use saturated fills for quick scanning
- tables use white background, compact rows, muted headers
- filter bars and tabs sit in white card containers
- manager views prefer control strips above tables instead of decorative section dividers

### Mobile shell

- bottom tab bar is fixed
- central AI tab is raised and visually dominant
- top bars are simple and full-width
- page background stays light gray

### Mobile content

- convert desktop tables into stacked cards
- keep business fields visible in priority order
- use bottom sheets for forms and actions
- preserve obvious submit/close actions in sheet footer

### Mobile AI

- AI chat is a full-screen route
- onboarding prompt cards appear directly inside the chat screen
- input stays docked above the bottom navigation

## Interaction patterns

- hover lift is subtle: small translateY and slightly stronger shadow
- active navigation is immediate and obvious
- forms are straightforward and operational
- warnings, counts, and statuses are visible without opening detail pages
- AI actions are framed as business accelerators, not novelty features

## What to copy

Copy these qualities:

- enterprise SaaS restraint
- business-task-first layout
- card-first composition
- direct, obvious controls
- compact but readable tables
- prominent AI entry points linked to real actions
- strong desktop/mobile parity at the workflow level

## What to avoid

Do not introduce:

- overly abstract dashboards
- playful illustration-heavy hero sections
- giant empty whitespace blocks
- heavy blur, frosted glass, or neon aesthetic
- animated ornaments unrelated to work tasks
- a totally new component vocabulary that no longer resembles this style

## Practical build guidance

When asked to build a new page in this style:

1. Identify whether it belongs to desktop shell, mobile shell, or both.
2. Choose the nearest canonical pattern from this file.
3. Reuse the same card, panel, table, chip, sheet, and button language.
4. Keep the business hierarchy explicit in the first screenful.
5. If AI is involved, make it a visible assistant surface with concrete operational outcomes.

## Optional host mapping

If the current repository already has related pages, map them to this style reference. If not, use this file directly as the style source of truth.
