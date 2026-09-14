import type { TagRecord } from "../types.js";
import { parseTagInput } from "../tags/canonicalize.js";

const NOTE_PREFIX = "bookmark-note:1:";
const RECENT_KEY = "recent-tags:1";
const MAX_NOTE_LENGTH = 280;
const MAX_RECENT_TAGS = 8;
const writeQueues = new Map<string, Promise<void>>();

type StoredNote = { readonly version: 1; readonly note: string };
type StoredRecentTags = { readonly version: 1; readonly tags: readonly TagRecord[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTags(value: unknown): readonly TagRecord[] {
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["tags"])) return [];
  const tags: TagRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of value["tags"]) {
    if (!isRecord(candidate) || typeof candidate["key"] !== "string" || typeof candidate["label"] !== "string") continue;
    const parsed = parseTagInput(candidate["label"]);
    if (parsed.kind === "invalid" || parsed.tag.key !== candidate["key"] || seen.has(parsed.tag.key)) continue;
    seen.add(parsed.tag.key);
    tags.push(parsed.tag);
    if (tags.length === MAX_RECENT_TAGS) break;
  }
  return tags;
}

async function serialized(storageKey: string, operation: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(storageKey) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  writeQueues.set(storageKey, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(storageKey) === current) writeQueues.delete(storageKey);
  }
}

export function bookmarkIdFromNoteKey(storageKey: string): string | undefined {
  if (!storageKey.startsWith(NOTE_PREFIX)) return undefined;
  const id = storageKey.slice(NOTE_PREFIX.length);
  return id.length === 0 ? undefined : id;
}

export async function listBookmarkNoteIds(): Promise<readonly string[]> {
  const stored: unknown = await chrome.storage.local.get(null);
  if (!isRecord(stored)) return [];
  return Object.keys(stored).flatMap((key) => {
    const id = bookmarkIdFromNoteKey(key);
    return id === undefined ? [] : [id];
  });
}

export async function removeBookmarkNotes(bookmarkIds: readonly string[]): Promise<void> {
  const keys = [...new Set(bookmarkIds)].filter((id) => id.length > 0).map((id) => `${NOTE_PREFIX}${id}`);
  if (keys.length > 0) await chrome.storage.local.remove(keys);
}

export async function loadBookmarkNote(bookmarkId: string): Promise<string> {
  const key = `${NOTE_PREFIX}${bookmarkId}`;
  const stored: unknown = await chrome.storage.local.get(key);
  if (!isRecord(stored)) return "";
  const value = stored[key];
  if (!isRecord(value) || value["version"] !== 1 || typeof value["note"] !== "string") return "";
  const note = value["note"].trim();
  return note.length <= MAX_NOTE_LENGTH ? note : "";
}

export async function writeBookmarkNote(bookmarkId: string, input: string): Promise<void> {
  const key = `${NOTE_PREFIX}${bookmarkId}`;
  const note = input.trim().slice(0, MAX_NOTE_LENGTH);
  await serialized(key, async () => {
    if (note.length === 0) {
      await chrome.storage.local.remove(key);
      return;
    }
    const payload: StoredNote = { version: 1, note };
    await chrome.storage.local.set({ [key]: payload });
  });
}

export async function loadRecentTags(): Promise<readonly TagRecord[]> {
  const stored: unknown = await chrome.storage.local.get(RECENT_KEY);
  return isRecord(stored) ? parseTags(stored[RECENT_KEY]) : [];
}

export async function updateRecentTags(committed: readonly TagRecord[]): Promise<void> {
  await serialized(RECENT_KEY, async () => {
    const existing = await loadRecentTags();
    const combined = [...committed, ...existing];
    const tags: TagRecord[] = [];
    const seen = new Set<string>();
    for (const tag of combined) {
      const parsed = parseTagInput(tag.label);
      if (parsed.kind === "invalid" || seen.has(parsed.tag.key)) continue;
      seen.add(parsed.tag.key);
      tags.push(parsed.tag);
      if (tags.length === MAX_RECENT_TAGS) break;
    }
    const payload: StoredRecentTags = { version: 1, tags };
    await chrome.storage.local.set({ [RECENT_KEY]: payload });
  });
}
