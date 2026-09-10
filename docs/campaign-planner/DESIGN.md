---
name: FlowMate Campaign Planner
description: Scoped record of the locally implemented Garena planning surface.
colors:
  garena-red: "#E41E26"
  garena-negative: "#DC2626"
  function-fallback-bg-light: "#F6F6F6"
  function-fallback-fg-light: "#4D4D4D"
  function-fallback-bg-dark: "#30343B"
  function-fallback-fg-dark: "#F7F7F7"
typography:
  body:
    fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 300
    lineHeight: 1.45
  title:
    fontSize: "20px"
    fontWeight: 700
  label:
    fontSize: "13px"
  progress:
    fontSize: "12px"
rounded:
  duration-bar: "4px"
  planner-dialog: "12px"
spacing:
  controls: "12px"
  toolbar: "16px"
  section: "24px"
---

# Design System: Campaign Planner

## Overview

This document applies only to Campaign Planner inside Marketing Plan. It records the local implementation as of 2026-09-10; it does not define a new global FlowMate identity or authorize changes to other screens. The design authority remains the existing Garena system, `PRODUCT.md`, and the design opening brief in `docs/CAMPAIGN_PLANNER_IMPLEMENTATION.md`.

The surface is a compact operational calendar: campaign identity stays readable beside proportional duration bars. Existing typography, icons, navigation and controls supply its visual language. No additional creative metaphor or palette is introduced.

## Colors

Garena red supplies primary actions and the Today marker. Semantic negative red identifies inline validation errors. Neutral surfaces, text and borders use the incumbent `--surface-page`, `--surface-divider`, `--fg-primary`, `--fg-secondary` and `--border-hairline` tokens from `garena/colors_and_type.css` and the active theme.

Duration bars use the selected Function's stored light/dark foreground and background pairs. The frontmatter records only the neutral fallbacks, not a replacement Function palette. Dark mode selects the dark pair explicitly. A Function label, exact dates and textual progress remain available alongside colour.

## Typography

Inherit the Garena font stack and existing page heading. Local section headings use the title role; campaign names and month headings use the bold weight. Labels use the label role, progress and exact dates use the progress role, and weekly subdivisions use small regular text (11px). Date ranges, week labels and progress use tabular numerals. Long campaign names wrap; duration-bar text ellipsizes.

## Layout

The header contains the page title and permitted actions without a subtitle. A wrapping toolbar holds view selection, previous/next, the month input, Today and a compact month-range/year label. Search, Function and archived filters follow. The month input has no visible reference-month label; its accessible name is retained. General help and campaign-count copy is reduced; essential state messages and form validation remain. These controls use the spacing values above.

The timeline is a CSS grid with a table-like reading order, not a semantic HTML table. Desktop rows reserve a sticky identity column (290px) beside a timeline of at least 560px. The rendered grid minimum width is `max(860, 290 + weekCount * 28)` pixels, allowing six- and twelve-month ranges to scroll horizontally rather than compress every week. The month/week header sticks to the top. The identity shows name, Function, archived state, whole-campaign progress and entered activity dates. Expanded content appears below its campaign row.

Three months is the default and aligns to calendar quarters. Six months aligns to Jan–Jun or Jul–Dec; twelve months aligns to Jan–Dec. Previous/next moves by the selected window. Months, weekly subdivisions and bars are proportional to actual calendar days, including leap years. Weeks run Monday–Sunday and are clipped at each month boundary. Each week shows its starting day number, with full start/end dates in its title. Dashed weekly guides and solid month-start boundaries extend through the tracks. Bars clip at visible range boundaries and show continuation chevrons. Undated campaigns appear in a separate section below the timeline when any exist.

The timeline scrolls inside a focusable region capped at 65vh. At widths up to 640px, the identity column becomes 210px; the inline dynamic grid minimum still takes precedence over the stylesheet's 780px mobile fallback. Surrounding controls wrap, catalog rows and the page heading stack, and form dates become one column. Expanded details remain a four-column table in their own horizontal scroll wrapper. Keep horizontal scrolling internal while retaining sticky campaign names.

## Elevation & Depth

Planner rows are flat, divided by the incumbent hairline border. Sticky opaque surfaces establish reading layers; the month header sits above row identities. The native modal is separated by a dark translucent backdrop (`rgb(0 0 0 / 45%)`). No Planner-specific shadow is introduced.

## Shapes

Reuse existing button, input, select and icon-button shapes. Duration bars have restrained corners and a current-colour outline. The dialog uses the larger local radius in the frontmatter, a hairline border and internal scrolling; its width is capped at 720px with viewport margins, and its height at `calc(100dvh - 48px)`.

## Components

- **Timeline bar:** a button, 40px high with a 6px minimum width, placed within a track at least 98px high. It displays Tagline or campaign name. Below 3% range width, visible text is hidden; the full name and dates remain in its accessible label and title. Hover slightly darkens the bar. The one-pixel Today line is non-interactive.
- **Campaign identity:** the name opens details; a separately labelled chevron expands content and exposes `aria-expanded`. Rows begin collapsed. Official activity dates remain distinct from derived publishing dates in details.
- **Expanded details:** a semantic table with scoped column headings: Product / Event, Channel, Launch Date, Status. It has a 570px minimum width, hairline row dividers and regular secondary-colour headings. The first column receives 38% width and wraps; dates and statuses stay on one line. Each row lists distinct channels and uses the earliest placement by launch date, time and channel for its launch date and stored Working Sheet status. Differing placement statuses append `(mixed)`; missing placement data shows an em dash. Reuse existing status badges and labels rather than a derived completion status.
- **Actions:** New Campaign, Manage Campaign, editing and Archive/Restore are Admin-only. Legacy Marketing Lead grants do not grant management access, and the Lead assignment interface is removed. Other users retain detail access. Manage Campaign is a settings icon button with an accessible label, title and pressed state; Refresh uses the rerun icon with an accessible label and title. Secondary controls use theme-aware surfaces and borders, a divider-colour hover, and reduced opacity when disabled.
- **Dialog:** a native `dialog` opened with `showModal()`, labelled by its heading. Browser modal focus containment and Escape dismissal are retained; dismissal and fieldset controls are blocked while saving. Name autofocus, labelled native date inputs, a concrete suffix example and inline errors support editing. Invalid fields expose `aria-invalid` and related error text. Failed saves retain the draft.
- **Feedback:** loading uses status text; errors use alerts and Refresh remains the retry action. No-match/empty messages, the conditional undated section and explicit Archived text identify state without relying on colour. Expanded-item failures expose a retry action. Progress is descriptive text, not a colour-only score.
- **Keyboard focus:** Planner descendants receive a two-pixel primary-foreground outline with a three-pixel offset. Keep the timeline itself keyboard focusable and all icon actions explicitly labelled.

## Do's and Don'ts

- **Do** preserve Garena theme tokens and existing Marketing Plan controls; scope new visual rules to Planner.
- **Do** keep campaign identity, exact dates and text progress readable when bar labels are clipped.
- **Do** retain aligned 3/6/12-month windows and date-proportional geometry.
- **Don't** infer activity dates from publishing dates; use the undated section until dates are entered.
- **Don't** turn Function colours into completion scores; retain their Function identity and separate progress text.
- **Don't** describe local synthetic fixtures as live campaign data or production verification. Local evidence is in `output/campaign-planner/`; authenticated full-app UAT and live deployment remain separate checks.

Implementation sources: `app.css` (Planner-scoped rules), `app.jsx` (`MarketingPlanCampaignPlannerScreen` and calendar/style helpers), and `garena/colors_and_type.css`. This scoped capture intentionally creates no root design file or global design sidecar.


### Equal weekly columns (latest revision)
All weekly columns have equal width and span Monday–Sunday without splitting at month boundaries. Month headers group weeks by their Monday; the first visible month also includes the preceding Monday when needed to retain its opening days. The final week extends through Sunday. Bars and Today use the same padded seven-day axis, while campaign inclusion and clipping retain the selected calendar period. This supersedes proportional partial-week columns.
