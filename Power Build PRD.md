# Markd — Power Build PRD

**Release:** V0.1+ Power Build\
**Product:** Markd\
**Priority:** Performance → Saving → Retrieval → Organization → Polish

## 1. Objective

Turn the existing functional V0.1 into a fast, highly usable personal bookmark utility.

This sprint does **not** aim to complete V0.2, V0.3, or any roadmap version in full.

The goal is to improve the two core Markd loops:

**Save:** Find something → invoke Markd → tag/contextualize → save → continue browsing.

**Retrieve:** Need something → open Markd → search/filter → find → open.

By the end of the sprint, Markd should feel significantly faster and should require much less friction for everyday saving and retrieval.

## 2. Product Constraints

Markd augments Chromium's native bookmark system. It does not replace it.

Chromium remains the source of truth for native bookmark information such as:

- bookmark ID
- title
- URL
- folder
- date added

Markd owns additional metadata such as:

- tags
- notes
- Markd-specific state

The product must remain:

- local-first
- lightweight
- fast
- keyboard-friendly
- compact
- privacy-preserving

Do not introduce accounts, servers, cloud databases, external AI services, analytics, or unnecessary browser permissions.

## 3. Sprint Priorities

Implementation priority is strict:

1. Performance and memory optimization
2. Quick Save
3. Keyboard workflow
4. Better retrieval/search
5. Bulk organization
6. UX polish

Do not sacrifice a higher-priority item to complete a lower-priority item.

If time becomes constrained, stop at the highest completed priority rather than implementing partial low-priority features.

---

# P0 — Performance & Memory Optimization

## Problem

The current extension appears to consume excessive memory.

Before adding significant functionality, audit the existing implementation and reduce unnecessary memory and rendering overhead.

## Requirements

Profile and inspect the existing implementation before making architectural changes.

Investigate at minimum:

- duplicate bookmark data stored in memory
- unnecessary copies of arrays during filtering/search
- unnecessary component rerenders
- duplicated event listeners
- listeners/effects without cleanup
- repeated Chromium bookmark API calls
- repeated storage reads
- unnecessary persistent background state
- expensive derived state
- favicon/resource loading
- large DOM trees
- expensive bookmark transformations
- memory retained after views/components are closed

Avoid duplicating native Chromium bookmark information in Markd storage unless technically necessary.

Prefer deriving filtered/search results from one normalized bookmark source rather than maintaining multiple synchronized copies.

### Large Lists

If Markd currently renders the entire bookmark collection into the DOM, implement list virtualization or an equivalent efficient rendering strategy.

The interface should remain responsive with thousands of bookmarks.

## Acceptance Criteria

- No obvious memory leaks remain.
- Event listeners and effects clean up correctly.
- Bookmark data is not unnecessarily duplicated.
- Search/filter operations do not create persistent redundant datasets.
- Large libraries do not require rendering every bookmark simultaneously.
- Existing V0.1 functionality still works.
- Agent documents the major performance problems discovered and changes made.

Do not perform unrelated architectural rewrites solely for theoretical cleanliness.

---

# P1 — Quick Save

## Goal

Allow the current page to be saved and organized without opening the full Markd library.

## Entry Point

Clicking the Markd extension icon should expose the Quick Save experience.

## New Page State

For a page that is not bookmarked, display:

- page title
- domain/URL
- native Chromium folder
- tags
- optional note
- Save action

The current page title and URL should be populated automatically.

### Folder

Allow selection from existing native Chromium bookmark folders.

Do not create a separate Markd folder system.

### Tags

Support:

- selecting existing tags
- creating tags
- multiple tags
- removing selected tags
- autocomplete

If inexpensive, surface recently used tags.

### Notes

Allow an optional short note.

Notes are Markd metadata and should not modify the native bookmark.

## Existing Bookmark State

Before creating a bookmark, check whether the current URL is already bookmarked.

If it exists:

- do not automatically create another bookmark
- show that the page is already bookmarked
- load existing Markd metadata
- allow tags/note to be edited
- provide an Update action instead of Save

Do not automatically delete or merge intentional duplicate native bookmarks.

## Acceptance Criteria

A user can:

Open a webpage → invoke Markd → choose folder → add tags → optionally add note → save.

If already bookmarked:

Open webpage → invoke Markd → see existing state → modify metadata → update.

---

# P1 — Keyboard Workflow

## Goal

The most common Markd actions should be possible without reaching for the mouse.

## Quick Save Shortcut

Add a Chromium extension command for opening/invoking Quick Save.

The implementation should use Chromium's extension command system rather than manually intercepting arbitrary page keystrokes.

Do not hard-code a shortcut that conflicts with common Chromium/macOS shortcuts without checking the existing extension configuration.

When Quick Save opens:

- focus the primary tag input where practical
- allow keyboard navigation through suggestions
- Enter selects/creates a tag
- provide an efficient keyboard action for completing Save/Update

## Library Shortcut

Where technically appropriate, provide a command for opening Markd's main library.

When opened through this workflow, search should receive focus automatically.

## Acceptance Criteria

The primary save and retrieval workflows can be completed primarily through the keyboard.

---

# P2 — Universal Search

## Goal

A user should be able to search based on what they remember about a resource rather than remembering exactly where it was stored.

## Search Fields

Expand search across:

- title
- URL
- domain
- tags
- notes

Include native folder name if inexpensive within the existing architecture.

Search should remain fast for large libraries.

## Behaviour

Search should:

- be case-insensitive
- update interactively
- work alongside existing filters
- preserve existing multi-tag filtering
- produce predictable results
- avoid unnecessary storage/API reads for every keystroke

Do not build advanced query syntax.

No AND/OR/NOT query language is required.

## Acceptance Criteria

Searching for a phrase present in a bookmark's title, URL/domain, tag, or note can surface that bookmark.

---

# P2 — Bulk Organization

## Goal

Make organizing an existing bookmark library substantially faster.

## Selection

Allow multiple bookmarks to be selected from the main library.

When selection is active, expose a compact bulk-action interface.

## Required Bulk Actions

Support:

- Add tag(s)
- Remove tag(s)

Changes should apply to every selected bookmark.

## Behaviour

Bulk actions must affect Markd metadata only.

Do not move, delete, rename, or otherwise modify native bookmarks through this feature.

## Acceptance Criteria

A user can:

Select multiple bookmarks → Add Tags → choose/create tags → apply.

And:

Select multiple bookmarks → Remove Tags → choose tags → apply.

The UI updates immediately after successful modification.

---

# P3 — Small UX Improvements

Only implement these after P0–P2 are stable.

## Recent View

Provide a simple way to view recently created/bookmarked items using available Chromium bookmark metadata.

Do not build activity tracking solely for this feature.

## Untagged

Preserve and polish the existing Untagged view.

It should remain an important workflow for gradually organizing an existing library.

## Recent Tags

If not already implemented during Quick Save, show recently used tags where useful.

Avoid introducing a complex recommendation system.

## Interaction Polish

Improve where necessary:

- loading states
- empty states
- error states
- keyboard focus
- hover states
- active filter visibility
- optimistic/local UI updates
- popup behaviour
- tag autocomplete
- obvious selection state
- duplicate-save prevention

Keep animations minimal.

Responsiveness and perceived speed matter more than visual effects.

---

# 4. Data & Reliability Requirements

Markd metadata must remain associated with the correct native bookmark.

Existing behaviour must continue to correctly handle:

- bookmark rename
- bookmark move
- bookmark deletion
- extension disable/re-enable
- metadata updates

Deleting a native bookmark should not leave uncontrolled orphaned Markd state.

Moving or renaming a native bookmark should not remove its tags or note when its bookmark ID remains valid.

Do not change native bookmarks unnecessarily.

---

# 5. Explicit Non-Goals

Do NOT implement during this sprint:

- Saved Views
- AI tagging
- automatic categorization
- rule-based tagging
- cloud sync
- accounts/authentication
- external backend
- analytics
- rich bookmark previews
- screenshots
- Open Graph cards
- dead-link checking
- duplicate-management interface
- tag merging
- tag colors
- nested tags
- custom Markd folders
- read-later functionality
- browser history
- external bookmark imports
- side panel
- omnibox integration
- mobile
- cross-browser support
- advanced query syntax
- major settings redesign

Do not pull later-roadmap features into the sprint simply because implementation appears convenient.

---

# 6. Engineering Rules

Work with the existing codebase rather than rebuilding Markd.

Before implementing each feature:

1. Inspect the relevant existing code.
2. Understand how the current implementation works.
3. Make the smallest reliable change that satisfies the requirement.
4. Preserve existing working behaviour.
5. Test the affected workflow.

Prefer implementation over speculative planning.

Do not spend significant time producing architecture documents, research reports, or elaborate implementation plans.

Do not refactor unrelated code.

Do not introduce new dependencies unless they materially simplify the implementation or solve a demonstrated performance problem.

Use existing project conventions wherever reasonable.

When requirements conflict, prioritize:

**Reliability → Performance → Speed of interaction → Feature completeness → Visual polish.**

---

# 7. Performance Guardrails

Performance is a product requirement, not optional cleanup.

Avoid:

- unnecessary bookmark-tree reloads
- redundant local-storage reads
- unnecessary React/global state
- storing easily derived values
- duplicated bookmark datasets
- unnecessary DOM nodes
- expensive synchronous operations during typing
- persistent background work without a user-facing reason

Cache only where caching demonstrably improves performance.

Do not trade significantly higher memory consumption for insignificant speed improvements.

---

# 8. Sprint Completion Definition

The sprint is successful if Markd can reliably support this experience:

### Save

```text
Browse page
→ invoke Markd
→ page detected
→ add tags
→ optional note
→ choose folder if needed
→ save
→ continue browsing
```

### Retrieve

```text
Open Markd
→ search
→ results appear quickly
→ optionally filter by tags
→ open bookmark
```

### Organize

```text
Open Library
→ find/select multiple bookmarks
→ apply tags
→ continue
```

And all three workflows remain responsive with a large native bookmark library.

---

# 9. Required Implementation Order

Follow this order unless an unavoidable technical dependency requires otherwise:

```text
1. Audit memory/performance
2. Fix highest-impact performance issues
3. Verify existing V0.1 functionality
4. Implement Quick Save
5. Implement existing-bookmark detection
6. Add notes
7. Add tag autocomplete/recent tags
8. Add keyboard commands
9. Expand search
10. Add bulk selection
11. Add bulk tag actions
12. Add Recent view if time permits
13. Polish states/interactions
14. Final regression test
```

Do not spend the first portion of the sprint creating a detailed plan for all fourteen steps.

Inspect → implement → test → continue.

---

# 10. Final Agent Deliverable

At the end of the sprint, provide a concise report containing:

**Completed**

- features successfully implemented

**Performance**

- identified causes of excessive resource usage
- optimizations made
- any before/after measurements available

**Incomplete**

- partially implemented or skipped requirements

**Issues**

- known bugs or technical risks

**Next**

- the 3–5 highest-value next improvements

Keep this report concise.

The primary deliverable is working software, not documentation.
