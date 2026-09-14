import {
  reconcileChangedMetadata,
  reconcileRemovedBookmark,
  reconcileStaleMetadata,
} from "./bookmarks/metadata-reconciliation.js";
import { bookmarkIdFromAssignmentKey } from "./tags/chrome-tag-storage.js";

let reconciliationPending = false;
let activeReconciliation: Promise<void> | undefined;
const pendingChangedIds = new Set<string>();
let activeChangedReconciliation: Promise<void> | undefined;

function reportFailure(operation: string, error: unknown): void {
  const kind = error instanceof Error ? error.name : "UnknownError";
  console.error(`Markd ${operation} failed: ${kind}`);
}

function queueFullReconciliation(): Promise<void> {
  reconciliationPending = true;
  if (activeReconciliation !== undefined) return activeReconciliation;
  activeReconciliation = (async (): Promise<void> => {
    try {
      while (reconciliationPending) {
        reconciliationPending = false;
        await reconcileStaleMetadata();
      }
    } finally {
      activeReconciliation = undefined;
    }
  })();
  return activeReconciliation;
}

function queueChangedReconciliation(bookmarkIds: readonly string[]): Promise<void> {
  for (const bookmarkId of bookmarkIds) pendingChangedIds.add(bookmarkId);
  if (activeChangedReconciliation !== undefined) return activeChangedReconciliation;
  activeChangedReconciliation = (async (): Promise<void> => {
    try {
      while (pendingChangedIds.size > 0) {
        const changedIds = [...pendingChangedIds];
        pendingChangedIds.clear();
        await reconcileChangedMetadata(changedIds);
      }
    } finally {
      activeChangedReconciliation = undefined;
    }
  })();
  return activeChangedReconciliation;
}

chrome.action.onClicked.addListener(() => {
  const libraryUrl = chrome.runtime.getURL("library.html");
  void chrome.tabs.create({ active: true, url: libraryUrl });
});

chrome.bookmarks.onRemoved.addListener((_id, removeInfo) => {
  void reconcileRemovedBookmark(removeInfo.node).catch((error: unknown) => {
    reportFailure("removed-bookmark reconciliation", error);
  });
});
chrome.bookmarks.onImportEnded.addListener(() => {
  void queueFullReconciliation().catch((error: unknown) => {
    reportFailure("import reconciliation", error);
  });
});
chrome.runtime.onStartup.addListener(() => {
  void queueFullReconciliation().catch((error: unknown) => {
    reportFailure("startup reconciliation", error);
  });
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const changedIds = Object.entries(changes).flatMap(([storageKey, change]) => {
    if (change.newValue === undefined) return [];
    const bookmarkId = bookmarkIdFromAssignmentKey(storageKey);
    return bookmarkId === undefined ? [] : [bookmarkId];
  });
  if (changedIds.length === 0) return;
  void queueChangedReconciliation(changedIds).catch((error: unknown) => {
    reportFailure("storage reconciliation", error);
  });
});

void queueFullReconciliation().catch((error: unknown) => {
  reportFailure("worker-start reconciliation", error);
});
