# FlowMate Size Template Scope

Date: 2026-07-01
Project: FlowMate
Theme: Auto Size / Format recommendation by Type and Channel

## Purpose

`Size / Format` should not rely on manual typing for common channels.

FlowMate should auto-suggest or auto-fill sizes based on:

- Type / Skill
- Channel Tag
- In-game placement when channel is In-game
- Custom size fallback when no template exists

This improves brief quality, reduces typing errors, and helps effort calculation reflect the true number of deliverables.

## Product Goal

When PIC creates or edits a Creative Request, FlowMate should suggest the right output sizes automatically.

Example:

```text
Type / Skill: Banner
Channel Tag: Facebook + Instagram

Suggested sizes:
- FB 1080x1080 Feed
- IG 1080x1080 Feed
- IG 1080x1920 Story/Reels
```

## Need Brief Visibility Matrix Impact

Size / Format is one of the fields that can block a task in `Need Brief`.

If required size data is missing:

| Surface | Expected behavior |
|---|---|
| Board | Task remains visible in `Need Brief` |
| List | Task remains searchable and filterable |
| Calendar | Task remains visible by Launch Date / Publish Time |
| Gantt Chart | Task appears as unassigned planning risk, not GD/VE workload |
| Workload | No assigned effort, WIP, capacity, or load impact |
| KPI | Count only as Need Brief risk/aging, not delivered or production performance |
| Detail | Shows missing size reason and size template picker |

Rule:

```text
Missing required size = Need Brief.
Need Brief = visible planning risk, not production workload.
```

## Supported Channels

- Facebook
- TikTok
- Instagram
- YouTube
- In-game
- Other

## In-game Size Templates

The following In-game banner sizes are approved input from the team:

| Placement | Size / Format |
|---|---|
| Full Size Splash | 730x504 |
| 1/3 Splash | 730x166 |
| PNG Free Roam + In-web | 240x76 |
| Scroll Banner | 240x160 |
| News Icon | 362x202 |
| Mission Hub Web Event | 668x157 |
| In-game Free Roam | 240x93 |
| In-game Tab Shop | 1359x144 |

## Recommended Default Size Templates

These defaults should be treated as configurable, not hardcoded forever.

### Facebook

| Type | Suggested size |
|---|---|
| Banner / Static | 1080x1080 Feed |
| Banner / Static | 1200x630 Landscape |
| Story / Reels usage | 1080x1920 Vertical |
| Video / Motion | 1080x1920 Vertical |
| Video / Motion | 1920x1080 Landscape |

### Instagram

| Type | Suggested size |
|---|---|
| Banner / Static | 1080x1080 Feed |
| Banner / Static | 1080x1350 Portrait |
| Story / Reels usage | 1080x1920 Vertical |
| Video / Motion | 1080x1920 Vertical |

### TikTok

| Type | Suggested size |
|---|---|
| Video / Motion | 1080x1920 Vertical |
| Static support / cover | 1080x1920 Vertical |

Official TikTok reference confirms vertical 9:16 is recommended for in-feed video, with at least 540x960px for vertical assets.

### YouTube

| Type | Suggested size |
|---|---|
| Video / Motion | 1920x1080 Landscape |
| Shorts | 1080x1920 Vertical |
| Thumbnail / Cover | 1280x720 Thumbnail |

Official YouTube guidance recommends high-definition video and at least 1280x720 for 16:9 uploads, with 1920x1080 preferred for high-quality 16:9 content.

### Other

Other should not guess a default size.

Expected behavior:

- Show `Custom size required`.
- Allow manual entry.
- Let admin add a reusable template later.

## Recommended Data Model

Use a configurable table instead of hardcoding sizes in the frontend.

```text
creative_size_templates
```

Suggested columns:

| Column | Purpose |
|---|---|
| id | Primary key |
| channel | Facebook, TikTok, Instagram, YouTube, In-game, Other |
| type_skill | Banner, Motion, Video Standard, etc. |
| placement | In-game placement or optional placement label |
| width | Pixel width |
| height | Pixel height |
| label | Human-readable label |
| format_type | Static, Video, Motion, Thumbnail, Other |
| is_default | Whether auto-selected by default |
| is_active | Hide old templates without deleting |
| sort_order | Display order |
| created_at | Audit |
| updated_at | Audit |

## UI Behavior

### Creative Request

When PIC selects Type / Skill and Channel Tag:

1. Load matching size templates.
2. Auto-select default templates when safe.
3. Show selected sizes as chips.
4. Allow removing suggested sizes.
5. Allow `+ Custom size`.

### In-game

When Channel Tag includes In-game:

1. Show In-game Placement picker.
2. Let PIC select one or many placements.
3. Auto-fill sizes from the approved In-game table.

### Multiple Channels

If multiple channels are selected:

- Show grouped sizes by channel.
- Avoid duplicate sizes unless the channel label is different.
- Keep channel context visible.

Example:

```text
FB 1080x1080 Feed
IG 1080x1080 Feed
IG 1080x1920 Story/Reels
```

## Effort Impact

Size automation should inform effort calculation, but should not blindly multiply every output.

Recommended model:

```text
Concept count x resize/output count
```

Examples:

| Scenario | Recommended effort interpretation |
|---|---|
| 1 banner, 1 size | 1 deliverable |
| 1 concept, 3 resized channels | 1 concept + resize effort |
| Hero Album x8 | 8 primary deliverables |
| Video 1 master + 2 cutdowns | 1 video + cutdown effort |

## Required Decisions Before Implementation

These should be confirmed before SQL/code work:

- Should Facebook and Instagram default to both square and vertical, or only one selected size?
- Should resize effort be counted separately from primary concept effort?
- Should In-game placements allow multi-select?
- Should `Other` require admin-approved templates or free text only?
- Should Size / Format be stored as structured rows or text summary plus JSON?

## Acceptance Criteria

- Selecting Channel + Type shows relevant size suggestions.
- In-game shows the approved placement list and size mapping.
- PIC can add a custom size when needed.
- Size / Format is no longer only a free-text field.
- Size choices are visible in Creative Request detail.
- Size choices are included in export/reporting.
- Assignment effort can use selected size/output count.
- Missing required size keeps the task in `Need Brief`.
- Missing required size does not consume GD/VE workload.

## Next Step

Confirm the default size choices and effort counting rule, then create SQL + UI prompts for implementation.
