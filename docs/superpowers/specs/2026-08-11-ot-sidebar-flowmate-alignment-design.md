# OT Sidebar FlowMate Alignment

## Goal

Make the OT Request left navigation visually match the FlowMate sidebar without changing navigation routes, access rules, or any other product module.

## Approved design

- Scope CSS to `.ot-sidebar` only.
- Keep the sidebar's existing one-pixel right divider.
- Remove the heavy dark outlines around every menu item.
- Use a white idle item; on hover, use the existing subtle neutral background.
- Use a pale neutral active item with a three-pixel Garena-red left indicator and bold text.
- Retain the current icon, text, keyboard focus treatment, section headings, and role-gated visibility.
- Keep responsive horizontal navigation behavior unchanged.

## Non-goals

- No navigation, authorization, data, generated JavaScript, or mobile layout changes.
- No changes to FlowMate, Marketing Plan, or Product Book shared navigation styles.

## Acceptance criteria

1. No OT sidebar item has a heavy visible outline in idle, hover, or active state.
2. The selected OT item has the same visual hierarchy as FlowMate's selected sidebar item.
3. Keyboard focus remains visibly distinguishable.
4. Existing OT UAT and production build pass.
