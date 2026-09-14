# Markd

## What This Is

Markd V0.1 is a lightweight Chromium extension that makes existing native bookmarks easier to organize and retrieve by adding reusable, multi-tag metadata. Chromium remains the source of truth for bookmark identity, title, URL, and folder structure; Markd provides a local tag layer and a single library interface for browsing, searching, filtering, and editing that metadata.

## Core Value

Native Chromium bookmarks become easier to organize and find when users can attach multiple tags to them.

## Requirements

### Validated

- ✓ Existing URL-bearing Chromium bookmarks appear in native order without folders, remain distinct by native bookmark ID, and can be opened from Markd with an appropriate empty state — Phase 1
- ✓ Users can create, reuse, add, and remove multiple trimmed, case-insensitively unique tags on any existing bookmark — Phase 2
- ✓ The Untagged view tracks zero-tag bookmarks as their first tag is added or final tag is removed — Phase 2
- ✓ Tag metadata remains local, keyed by native bookmark ID, and persists across page, worker, and browser restarts without an account or backend — Phase 2
- ✓ Users can search titles and URLs/domains with case-insensitive partial matching and combine search with multi-tag AND filters — Phase 3
- ✓ All, Untagged, search, tag filters, results, tag editing, and empty/no-result states are available from one primary page — Phases 1–3
- ✓ Native bookmark creation, updates, moves, and deletions synchronize safely while valid tags are preserved and stale metadata is reconciled — Phase 4
- ✓ Markd observes Chromium bookmarks without automatically moving, renaming, deleting, or reorganizing them — Phase 4

### Active

No active V0.1 requirements remain after implementation and manual acceptance testing.

### Out of Scope

- Custom bookmark or save popup, save-current-page workflow, save keyboard shortcuts, and context-menu saving — V0.1 does not change Chromium's normal bookmarking flow.
- Notes, bulk tagging, tag management or merging, folder or domain filters, Saved Views, and advanced AND/OR filtering — deferred beyond the minimal tag layer.
- Accounts, authentication, cloud sync, backend infrastructure, sharing, and collaboration — all metadata remains local in V0.1.
- AI, automatic tagging, screenshots, rich previews, and read-later features — not required to prove the core idea.

## Context

Markd V0.1 is an implemented and manually accepted Chromium extension. The V0.1 product brief is `PRD.md`, which remains authoritative for product intent, scope, requirements, and definition of done. The extension augments the user's pre-existing native bookmark collection rather than importing it into a separate library, and duplicate URLs remain distinct when Chromium stores them as separate bookmark nodes.

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
| Keep Chromium as the bookmark source of truth | Preserves the user's existing bookmark workflow and avoids a parallel bookmark database | ✓ Validated in Phase 1 |
| Store only Markd metadata locally | Satisfies privacy, persistence, and no-backend requirements | ✓ Validated in Phase 2 |
| Key bookmark-to-tag relationships by native bookmark identity | Preserves distinct duplicate URLs and tags through bookmark property changes | ✓ Validated across Phases 2 and 4 |
| Observe native bookmark lifecycle without mutating Chromium organization | Keeps Chromium authoritative while allowing Markd to reconcile its metadata safely | ✓ Validated in Phase 4 |

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
*Last updated: 2026-09-10 after V0.1 manual acceptance*
