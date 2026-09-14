export type ActivePage = {
  readonly title: string;
  readonly url: string;
  readonly domain: string;
};

export type FolderChoice = { readonly id: string; readonly label: string };
export type BookmarkMatch = {
  readonly id: string;
  readonly title: string;
  readonly folderId: string;
  readonly folderLabel: string;
};
export type QuickSaveContext = {
  readonly page: ActivePage;
  readonly folders: readonly FolderChoice[];
  readonly matches: readonly BookmarkMatch[];
};
export type ActivePageResult =
  | { readonly kind: "ready"; readonly page: ActivePage }
  | { readonly kind: "error"; readonly message: string };

export function parseActivePage(tab: chrome.tabs.Tab | undefined): ActivePageResult {
  if (tab?.url === undefined) return { kind: "error", message: "The active page has no URL." };
  let parsed: URL;
  try {
    parsed = new URL(tab.url);
  } catch (error: unknown) {
    if (error instanceof TypeError) return { kind: "error", message: "The active page has an invalid URL." };
    throw error;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { kind: "error", message: "This page cannot be bookmarked." };
  }
  return {
    kind: "ready",
    page: { title: tab.title?.trim() || tab.url, url: tab.url, domain: parsed.hostname },
  };
}

export function deriveQuickSaveContext(
  page: ActivePage,
  tree: readonly chrome.bookmarks.BookmarkTreeNode[],
): QuickSaveContext {
  const folders: FolderChoice[] = [];
  const matches: BookmarkMatch[] = [];
  const visit = (node: chrome.bookmarks.BookmarkTreeNode, ancestors: readonly string[], synthetic: boolean): void => {
    const isFolder = node.url === undefined;
    const path = synthetic || !isFolder ? ancestors : [...ancestors, node.title];
    if (!synthetic && isFolder) folders.push({ id: node.id, label: path.join(" / ") });
    if (node.url === page.url) {
      matches.push({
        id: node.id,
        title: node.title,
        folderId: node.parentId ?? "",
        folderLabel: ancestors.join(" / "),
      });
    }
    for (const child of node.children ?? []) visit(child, path, false);
  };
  for (const root of tree) visit(root, [], true);
  return { page, folders, matches };
}
