function firstUrlNode(
  nodes: readonly chrome.bookmarks.BookmarkTreeNode[],
): chrome.bookmarks.BookmarkTreeNode | undefined {
  for (const node of nodes) {
    if (node.url !== undefined) {
      return node;
    }
    const descendant = firstUrlNode(node.children ?? []);
    if (descendant !== undefined) {
      return descendant;
    }
  }
  return undefined;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new TypeError(`Missing required element: ${id}`);
  }
  return element;
}

function renderBookmark(node: chrome.bookmarks.BookmarkTreeNode, container: HTMLElement): void {
  if (node.url === undefined) {
    throw new TypeError("Cannot render a bookmark without a URL");
  }
  const nativeUrl = node.url;
  const link = document.createElement("a");
  link.href = nativeUrl;
  link.textContent = node.title.length > 0 ? node.title : nativeUrl;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.tabs.create({ active: true, url: nativeUrl });
  });
  container.replaceChildren(link);
}

async function bootstrap(): Promise<void> {
  const status = requiredElement("status");
  const container = requiredElement("bookmarks");
  const roots = await chrome.bookmarks.getTree();
  const bookmark = firstUrlNode(roots);
  if (bookmark === undefined) {
    status.textContent = "No bookmarks found.";
    return;
  }
  renderBookmark(bookmark, container);
  status.textContent = "";
}

void bootstrap();
