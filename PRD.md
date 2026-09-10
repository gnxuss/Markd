# Markd --- V0.1 PRD

**Version:** V0.1 --- The Tag Layer\
**Purpose:** Source of truth for the agent building Markd V0.1.

> Markd V0.1 is a lightweight Chromium extension that adds tags and
> better retrieval to the user's existing browser bookmarks. Chromium
> remains the source of truth for bookmarks; Markd only adds metadata.

## 1. Goal

Prove one core idea: **native Chromium bookmarks become easier to
organize and find when users can attach multiple tags to them.**

V0.1 focuses on organizing existing bookmarks. It does not change the
normal browser bookmarking flow.

## 2. Core Requirements

### Bookmark Library

Read the user's existing Chromium bookmarks automatically and display
actual bookmarks, not folders, in a simple Markd library. Each bookmark
should show at minimum its title, domain/URL, and Markd tags. Clicking a
bookmark opens its URL. Bookmarks created before Markd was installed
must work normally.

### Tags

Users must be able to create tags, add multiple tags to one bookmark,
remove tags, tag any existing bookmark, and reuse existing tags. Tag
names should be trimmed and case-insensitive for uniqueness, so `Design`
and `design` must not become separate tags.

### Search

Search bookmarks by title and URL/domain. Search must be
case-insensitive and support partial matches.

### Filtering

Users can filter bookmarks by one or multiple tags. Multiple tags use
**AND logic**, so `#design + #inspiration` returns only bookmarks
containing both tags. Search and tag filters must work together.

### Untagged

Provide an **Untagged** view containing every bookmark with zero Markd
tags. Adding a bookmark's first tag removes it from Untagged; removing
its final tag adds it back.

### Local Persistence

All Markd metadata stays local. V0.1 requires no account,
authentication, backend, or cloud database. Tags must survive browser
and extension restarts.

### Native Bookmark Sync

Markd must remain aligned with Chromium bookmarks. Renaming, moving, or
changing the URL of a bookmark should preserve its tags as long as its
native bookmark identity remains valid. Deleted bookmarks should
disappear from Markd and have stale metadata cleaned up. Bookmarks
created normally in Chromium should automatically become available in
Markd. Markd must never automatically move, rename, delete, or
reorganize native bookmarks.

## 3. Basic Interface

V0.1 needs one primary extension page containing All bookmarks, Untagged
bookmarks, the tag list/filtering, search, bookmark results, and a
simple way to add or remove tags from a selected bookmark.

``` text
┌────────────────────────────────────────────┐
│ Markd                       Search...      │
├──────────────┬─────────────────────────────┤
│ All          │ Bookmark Title              │
│ Untagged     │ example.com                 │
│              │ #design #reference          │
│ Tags         │                             │
│ #design      │ Another Bookmark            │
│ #figma       │ another.com                 │
│ #research    │ #figma #research            │
└──────────────┴─────────────────────────────┘
```

The exact bookmark editor pattern, such as a modal, drawer, or detail
pane, is a design decision. Handle basic empty states such as no
bookmarks, no tags, and no matching results.

## 4. Product & Data Rules

Chromium owns the bookmark ID, title, URL, and folder structure. Markd
owns tags and bookmark-to-tag relationships. Markd metadata should
reference the native Chromium bookmark rather than creating an
independent bookmark library.

Duplicate URLs must not automatically be merged because Chromium may
contain separate bookmarks with the same URL. Only request extension
permissions required for V0.1; do not request broad page/site access for
hypothetical future features.

## 5. Explicit Non-Goals

Do **not** build these in V0.1: custom bookmark/save popup,
save-current-page workflow, keyboard shortcut for saving, context-menu
saving, notes, bulk tagging, tag management/merging tools, folder/domain
filters, Saved Views, advanced AND/OR filtering, accounts, cloud sync,
AI, automatic tagging, screenshots, rich previews, read-later features,
sharing, collaboration, or backend infrastructure.

These belong to later versions.

## 6. Definition of Done

V0.1 is complete when existing Chromium bookmarks load automatically;
users can create, reuse, add, and remove tags; multiple tags can belong
to one bookmark; metadata persists after browser restart; title/URL
search works; single and multi-tag filtering work using AND logic;
search and filters work together; Untagged works; moving or renaming
native bookmarks does not lose tags; newly created native bookmarks
appear in Markd; deleted bookmarks are reconciled safely; basic
empty/no-result states work; and no account, backend, or internet
service is required.

## Agent Rule

Build the **smallest reliable implementation** that satisfies this PRD.
Do not add features or infrastructure for later versions unless
explicitly instructed. If a requirement conflicts with Chromium
extension limitations, flag it rather than silently changing the product
behavior.

> **V0.1 is a reliable tag layer for the bookmarks already inside
> Chromium.**
