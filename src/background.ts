import {
  reconcileRemovedBookmark,
  reconcileStaleMetadata,
} from "./bookmarks/metadata-reconciliation.js";
import { bookmarkIdFromAssignmentKey } from "./tags/chrome-tag-storage.js";

let reconciliationPending = false;
let activeReconciliation: Promise<void> | undefined;

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
  const addedAssignment = Object.entries(changes).some(([storageKey, change]) =>
    bookmarkIdFromAssignmentKey(storageKey) !== undefined && change.newValue !== undefined);
  if (!addedAssignment) return;
  void queueFullReconciliation().catch((error: unknown) => {
    reportFailure("storage reconciliation", error);
  });
});

void queueFullReconciliation().catch((error: unknown) => {
  reportFailure("worker-start reconciliation", error);
});
