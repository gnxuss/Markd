# Markd

## What This Is

Markd V0.1 is a lightweight Chromium extension that makes existing native bookmarks easier to organize and retrieve by adding reusable, multi-tag metadata. Chromium remains the source of truth for bookmark identity, title, URL, and folder structure; Markd provides a local tag layer and a single library interface for browsing, searching, filtering, and editing that metadata.

## Core Value

Native Chromium bookmarks become easier to organize and find when users can attach multiple tags to them.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Automatically display existing and newly created Chromium bookmarks, excluding folders.
- [ ] Let users create, reuse, add, and remove multiple tags on any existing bookmark.
- [ ] Keep tag names trimmed and case-insensitively unique.
- [ ] Search bookmark titles and URLs/domains with case-insensitive partial matching.
- [ ] Filter by one or more tags using AND logic and combine tag filters with search.
- [ ] Provide an Untagged view that updates when a bookmark gains its first tag or loses its final tag.
- [ ] Persist all Markd metadata locally across browser and extension restarts.
- [ ] Preserve tags across native bookmark renames, moves, and URL changes while the Chromium bookmark identity remains valid.
- [ ] Reconcile native bookmark creation and deletion without mutating or reorganizing Chromium bookmarks.
- [ ] Provide one primary extension page with All, Untagged, tag filters, search, bookmark results, tag editing, bookmark opening, and basic empty/no-result states.

### Out of Scope

- Custom bookmark or save popup, save-current-page workflow, save keyboard shortcuts, and context-menu saving — V0.1 does not change Chromium's normal bookmarking flow.
- Notes, bulk tagging, tag management or merging, folder or domain filters, Saved Views, and advanced AND/OR filtering — deferred beyond the minimal tag layer.
- Accounts, authentication, cloud sync, backend infrastructure, sharing, and collaboration — all metadata remains local in V0.1.
- AI, automatic tagging, screenshots, rich previews, and read-later features — not required to prove the core idea.

## Context

Markd is a greenfield Chromium extension. The V0.1 product brief is `PRD.md`, which is authoritative for product intent, scope, requirements, and definition of done. The extension augments the user's pre-existing native bookmark collection rather than importing it into a separate library, and duplicate URLs must remain distinct when Chromium stores them as separate bookmark nodes.

## Constraints

- **Platform**: Chromium extension — native bookmarks must be accessed through supported extension APIs.
- **Data ownership**: Chromium owns bookmark ID, title, URL, and folder structure; Markd owns only tags and bookmark-to-tag relationships.
- **Persistence**: Metadata must stay local and survive browser and extension restarts — no account, backend, cloud database, or internet service.
- **Identity**: Metadata must reference native bookmark identity — duplicate URLs must not be merged.
- **Safety**: Markd must never automatically move, rename, delete, or reorganize native bookmarks.
- **Permissions**: Request only permissions required for V0.1 — no broad page or site access for hypothetical features.
- **Scope**: Build the smallest reliable implementation that satisfies `PRD.md`; do not add later-version infrastructure or features.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Chromium as the bookmark source of truth | Preserves the user's existing bookmark workflow and avoids a parallel bookmark database | — Pending |
| Store only Markd metadata locally | Satisfies privacy, persistence, and no-backend requirements | — Pending |
| Key bookmark-to-tag relationships by native bookmark identity | Preserves distinct duplicate URLs and tags through bookmark property changes | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-08 after initialization*
