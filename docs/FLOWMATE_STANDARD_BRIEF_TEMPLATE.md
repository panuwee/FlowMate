# FlowMate Standard Brief Template

Date: 2026-07-01
Project: FlowMate
Theme: Standardized creative brief for Static and VDO / Motion work

## Purpose

The team currently uses Google Slide briefs, and each PIC may structure the brief differently.

FlowMate should standardize the required brief information so the system can:

- Detect incomplete briefs.
- Keep tasks in `Need Brief` until ready.
- Reduce back-and-forth between PIC and GD/VE.
- Improve assignment quality.
- Create a consistent source of truth.
- Optionally generate a Google Slide brief later.

Google Slides can remain as supporting reference, but structured FlowMate fields should become the source of truth.

## Brief Model

Every Creative Request should have:

```text
Common Brief
  -> Static Brief
  OR
  -> VDO / Motion Brief
```

The selected `Type / Skill` decides which template appears.

## Type Mapping

### Static Brief

Use for:

- Banner
- Hero Album
- Logo
- Web Reskin
- New Web
- CDN Design
- Resize
- Graphic Pack
- KV Design
- Jersey Design
- Jersey In-game
- Merchandise Design

### VDO / Motion Brief

Use for:

- Video Standard
- Video Under 1 Min
- Motion

## Common Brief Fields

These fields apply to all Creative Requests.

| Field | Required | Purpose |
|---|---:|---|
| Campaign | Yes | Campaign grouping and reporting |
| Product / Event | Yes | Main content subject |
| Objective | Yes | What the asset must achieve |
| Target audience | Yes | Who the asset is for |
| Channel Tag | Yes | Where the asset will be published |
| Launch Date | Yes | Planned go-live date |
| Publish Time | Yes | Planned go-live time |
| Content Tier | Yes | Priority / business importance |
| Type / Skill | Yes | Assignment and effort logic |
| Asset Count | Yes | Effort calculation |
| Size / Format | Yes | Required output size |
| Key message | Yes | Main message to communicate |
| Mandatory copy / CTA | Conditional | Required when copy or CTA must appear |
| Brief Link | Optional | Supporting Google Slide / document link |
| Reference Link | Optional | Figma, mood board, past asset, footage, or source |
| Reviewer / Approver | Optional | Person expected to approve final output |
| Final file expectation | Optional | PSD, AI, MP4, PNG, editable source, etc. |
| Notes | Optional | Extra context |

## Static Brief Fields

| Field | Required | Notes |
|---|---:|---|
| Visual direction | Yes | Mood, style, composition, references |
| Text hierarchy | Yes | Headline, subline, CTA priority |
| Required logo / sponsor / partner | Conditional | Required when partner branding applies |
| Character / item / product source | Conditional | Required when specific game item or character appears |
| Do / Don't | Optional | Brand or legal constraints |
| Version requirement | Conditional | Required for multiple versions such as Hero Album x8 |
| Output sizes | Yes | Can be auto-filled by Size Template |
| Editable source requirement | Optional | Whether layered files are needed |

### Static Brief Completeness Rule

A Static brief is complete when:

- Common required fields are complete.
- Visual direction is present.
- Text hierarchy is present.
- Size / Format is selected or auto-generated.
- Asset Count is greater than 0.
- Any required branding or source asset is provided when applicable.

## VDO / Motion Brief Fields

| Field | Required | Notes |
|---|---:|---|
| Duration | Yes | Example: 6s, 15s, 30s, under 1 min |
| Aspect ratio | Yes | Example: 9:16, 1:1, 16:9 |
| Hook | Yes | First 1-3 seconds |
| Script / storyboard | Yes | Can be text, document, or slide link |
| Scene order | Conditional | Required when video has multiple beats/scenes |
| Footage source | Conditional | Required when using gameplay or raw video |
| VO / subtitle requirement | Optional | Voice-over, subtitle, caption needs |
| Music / SFX direction | Optional | Audio direction |
| End card / CTA | Conditional | Required for ads or campaign push |
| Cutdown requirement | Optional | Example: 30s main + 15s + 6s |
| Render format | Optional | Example: MP4 H.264 |
| Thumbnail requirement | Optional | Required when video needs preview/thumbnail |

### VDO / Motion Brief Completeness Rule

A VDO / Motion brief is complete when:

- Common required fields are complete.
- Duration is present.
- Aspect ratio is selected.
- Hook is present.
- Script / storyboard is present.
- Footage source is present when footage is required.
- End card / CTA is present when campaign conversion is required.

## Need Brief Rule

If any required field is missing, the task remains in:

```text
Need Brief
```

The assignment engine should not assign GD/VE until the brief is complete.

## Need Brief Visibility Matrix

Brief completeness controls whether the work can enter production. It should not control whether the work is visible.

| Surface | Need Brief behavior |
|---|---|
| Board | Visible in `Need Brief` column before Assigned |
| List | Visible and filterable by status |
| My Work | Visible to the requester/PIC as brief follow-up work |
| Calendar | Visible by Launch Date / Publish Time as a planning risk |
| Gantt Chart | Visible as Need Brief / Unassigned / PIC work, not under GD/VE workload rows |
| Central Queue | Visible for supervisor triage |
| Workload | Excluded from assigned effort, WIP, capacity, and load |
| KPI | Excluded from delivered/active production metrics; included only in Need Brief count, aging, and PIC risk metrics |
| Notifications | Can trigger reminders to PIC/requester/watchers |
| Detail | Shows missing required fields and lets PIC complete the brief |

Required rule:

```text
Brief incomplete = visible task + no GD/VE workload.
Brief complete = assignment engine can run.
```

## Missing Brief Reason Examples

FlowMate should show a simple missing reason:

- `Missing key message.`
- `Missing visual direction.`
- `Missing size / format.`
- `Missing duration.`
- `Missing script or storyboard.`
- `Missing footage source.`
- `Missing required channel size.`

## UI Recommendation

Do not make Creative Request feel like one long form.

Recommended layout:

1. Request basics
2. Assignment inputs
3. Size / Format
4. Brief Template
5. Supporting links

The Brief Template section can be collapsible, but required missing fields should be visible when status is `Need Brief`.

## Google Slide Relationship

Google Slide should become optional support, not the primary source of truth.

Recommended future feature:

```text
Generate Brief Slide
```

This can generate a standardized Google Slide from structured FlowMate fields.

## Acceptance Criteria

- Static work shows Static Brief fields.
- VDO / Motion work shows VDO / Motion Brief fields.
- Common required fields apply to both templates.
- Missing required fields keep task in `Need Brief`.
- Missing required fields keep the task visible across planning views.
- Missing required fields do not count against GD/VE workload, WIP, or capacity.
- Completed brief allows assignment engine to run.
- Brief Link remains available as supporting reference.
- The UI does not require irrelevant fields for the selected type.

## Next Step

Confirm required and optional fields with PIC, GD/VE, and Marketing Manager before implementation, then convert this template into SQL fields and frontend validation.
