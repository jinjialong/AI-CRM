---
name: sfa-crm-frontend-style
description: Portable frontend style for enterprise CRM plus AI copilot products. Use when building or revising CRM pages, admin pages, dashboards, login flows, AI assistant panels, mobile business screens, or any React/Next frontend that should feel like a high-density business system with white cards, gray canvas, blue primary actions, dark desktop navigation, strong desktop/mobile parity, and practical AI surfaces instead of a generic startup UI.
---

# SFA CRM Frontend Style

Apply this skill when the user wants new frontend work to follow this specific CRM style or equivalent phrasing.

Treat this skill as self-contained. It should still make sense after being copied into another repository.

## Working mode

1. Read the relevant current files first.
2. Use `references/style-reference.md` as the canonical style definition instead of assuming any external reference tree exists.
3. Keep the existing stack and architecture unless the user explicitly asks to change them.
4. Prefer matching this product language over inventing a prettier but different design.
5. For greenfield projects, use this skill as the initial UI style source of truth.

## Style rules

### Preserve the product character

Build for an enterprise CRM with AI assistance:

- dense but readable information layout
- clear business hierarchy over decorative visuals
- neutral gray canvas with white cards
- blue as the default action color
- orange for onboarding or AI demo emphasis
- dark navy for desktop navigation and high-trust actions

Do not turn this style into:

- glassmorphism
- oversized marketing gradients
- soft consumer-app aesthetics
- excessive rounded pills everywhere
- sparse landing-page spacing

### Layout patterns

Use simple structural shells:

- desktop: fixed dark sidebar, light content canvas, optional right chat panel
- mobile: top app bar or title strip, full-height content, fixed bottom tab bar
- page bodies: card stacks, metric rows, filter bars, tables, and sheets

Prefer clear rectangular blocks. Typical radii are `6px`, `8px`, `10px`, or `12px`.

### Component patterns

When creating new UI, bias toward these forms:

- metric cards with saturated solid backgrounds and large numeric values
- white management cards with thin borders and light shadows
- onboarding cards with warm orange-tinted background and stronger accent border
- desktop tables with compact rows and muted header background
- mobile business lists rendered as stacked cards instead of dense tables
- AI chat as a dedicated surface, not a tiny embedded widget
- forms with straightforward labels, pale backgrounds, and obvious primary submit buttons

### Interaction rules

Use restrained motion:

- slight lift on hover
- small shadow increase on hover
- quick transitions around `0.15s` to `0.2s`

Prefer explicit state styling:

- disabled = reduced opacity plus blocked cursor
- error = light red background with red border/text
- active tab = solid brand blue fill or strong blue text
- warning = yellow/orange badge or chip

### Implementation bias

The original implementation pattern behind this style relied heavily on inline styles inside React components. When applying the style elsewhere, match the surrounding codebase first, but preserve the same visual and interaction language.

When extending pages in this style:

- co-locate visual styling with the component when that is already the file's pattern
- keep primitives simple and readable
- favor direct `style={{...}}` objects over introducing styling systems
- keep responsive behavior explicit in layout structure, route split, or separate mobile components

When copying this skill into a different project:

- keep the folder self-contained
- do not add dependencies on files outside the skill unless the new project explicitly wants that
- adapt implementation details to the host stack, but keep the style contract intact

## Delivery checklist

Before finishing UI work under this skill, verify:

1. The page still looks like a business CRM, not a generic startup template.
2. Colors, spacing, shadows, and radii align with the reference file.
3. Desktop and mobile patterns follow the project's split-screen or tabbar conventions when relevant.
4. AI-related entry points are prominent but still operationally grounded.
5. Information density remains practical for sales/admin workflows.

## References

- Detailed style extraction: `references/style-reference.md`
