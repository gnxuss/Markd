import type { TagAssignments, TagRecord } from "../types.js";
import { parseTagInput } from "./canonicalize.js";

const STORAGE_PREFIX = "bookmark-tags:1:";
const writeQueues = new Map<string, Promise<void>>();

type StoredTagPayload = {
  readonly version: 1;
  readonly tags: readonly TagRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredTags(value: unknown): readonly TagRecord[] | undefined {
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["tags"])) {
    return undefined;
  }
  const tags: TagRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of value["tags"]) {
    if (!isRecord(candidate) || typeof candidate["key"] !== "string" || typeof candidate["label"] !== "string") {
      return undefined;
    }
    const parsed = parseTagInput(candidate["label"]);
    if (parsed.kind === "invalid" || parsed.tag.key !== candidate["key"] || seen.has(candidate["key"])) {
      return undefined;
    }
    seen.add(candidate["key"]);
    tags.push(parsed.tag);
  }
  return tags;
}

export function bookmarkIdFromAssignmentKey(storageKey: string): string | undefined {
  if (!storageKey.startsWith(STORAGE_PREFIX)) return undefined;
  const bookmarkId = storageKey.slice(STORAGE_PREFIX.length);
  return bookmarkId.length > 0 ? bookmarkId : undefined;
}

export async function listBookmarkTagIds(): Promise<readonly string[]> {
  const stored: unknown = await chrome.storage.local.get(null);
  if (!isRecord(stored)) return [];
  return Object.keys(stored).flatMap((storageKey) => {
    const bookmarkId = bookmarkIdFromAssignmentKey(storageKey);
    return bookmarkId === undefined ? [] : [bookmarkId];
  });
}

export async function removeBookmarkTagAssignments(bookmarkIds: readonly string[]): Promise<void> {
  const storageKeys = [...new Set(bookmarkIds)]
    .filter((bookmarkId) => bookmarkId.length > 0)
    .map((bookmarkId) => `${STORAGE_PREFIX}${bookmarkId}`);
  if (storageKeys.length > 0) await chrome.storage.local.remove(storageKeys);
}

export async function loadTagAssignments(): Promise<TagAssignments> {
  const stored: unknown = await chrome.storage.local.get(null);
  if (!isRecord(stored)) return {};
  const assignments: Record<string, readonly TagRecord[]> = {};
  for (const [storageKey, value] of Object.entries(stored)) {
    const bookmarkId = bookmarkIdFromAssignmentKey(storageKey);
    const tags = parseStoredTags(value);
    if (bookmarkId !== undefined && tags !== undefined) assignments[bookmarkId] = tags;
  }
  return assignments;
}

export async function writeBookmarkTags(
  bookmarkId: string,
  tags: readonly TagRecord[],
): Promise<void> {
  const storageKey = `${STORAGE_PREFIX}${bookmarkId}`;
  const previous = writeQueues.get(bookmarkId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    if (tags.length === 0) {
      await chrome.storage.local.remove(storageKey);
      return;
    }
    const payload: StoredTagPayload = { version: 1, tags };
    await chrome.storage.local.set({ [storageKey]: payload });
  });
  writeQueues.set(bookmarkId, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(bookmarkId) === current) writeQueues.delete(bookmarkId);
  }
}
