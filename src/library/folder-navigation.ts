import type { LibraryState, NativeFolderNode } from "../types.js";

type FolderNavigationDependencies = {
  readonly root: HTMLElement;
  readonly selectFolder: (folderId: string) => void;
  readonly clearFolder: () => void;
};

export type FolderNavigation = {
  readonly render: (state: LibraryState) => void;
  readonly dispose: () => void;
};

function displayTitle(folder: NativeFolderNode): string {
  return folder.title.trim().length === 0 ? "Untitled folder" : folder.title;
}

function selectedPath(
  folders: readonly NativeFolderNode[],
  selectedId: string,
  ancestors: readonly string[] = [],
): readonly string[] | undefined {
  for (const folder of folders) {
    const path = [...ancestors, displayTitle(folder)];
    if (folder.id === selectedId) return path;
    const nested = selectedPath(folder.children, selectedId, path);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function folderIds(folders: readonly NativeFolderNode[]): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (nodes: readonly NativeFolderNode[]): void => {
    for (const folder of nodes) {
      ids.add(folder.id);
      visit(folder.children);
    }
  };
  visit(folders);
  return ids;
}

export function createFolderNavigation(
  dependencies: FolderNavigationDependencies,
): FolderNavigation {
  const expanded = new Set<string>();
  let latestState: LibraryState = { kind: "loading" };
  let disposed = false;

  const renderFolders = (
    folders: readonly NativeFolderNode[],
    selectedFolderId: string | undefined,
  ): void => {
    const validIds = folderIds(folders);
    for (const id of expanded) {
      if (!validIds.has(id)) expanded.delete(id);
    }
    const content: HTMLElement[] = [];
    if (selectedFolderId !== undefined) {
      const path = selectedPath(folders, selectedFolderId);
      if (path !== undefined) {
        const clear = document.createElement("button");
        clear.className = "selected-folder folder-clear";
        clear.type = "button";
        clear.title = path.join(" / ");
        clear.setAttribute("aria-label", `Clear folder filter: ${path.join(" / ")}`);
        const label = document.createElement("span");
        label.textContent = path.join(" / ");
        const icon = document.createElement("span");
        icon.className = "selected-folder-clear";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "×";
        clear.append(label, icon);
        clear.addEventListener("click", dependencies.clearFolder);
        content.push(clear);
      }
    }
    if (folders.length === 0) {
      const empty = document.createElement("p");
      empty.className = "folder-empty";
      empty.textContent = "No folders";
      content.push(empty);
      dependencies.root.replaceChildren(...content);
      return;
    }
    const tree = document.createElement("ul");
    tree.className = "folder-tree";
    const appendFolders = (
      parent: HTMLUListElement,
      nodes: readonly NativeFolderNode[],
      depth: number,
    ): void => {
      for (const folder of nodes) {
        const item = document.createElement("li");
        item.className = "folder-node";
        const row = document.createElement("div");
        row.className = "folder-row";
        row.style.setProperty("--folder-depth", String(depth));
        const title = displayTitle(folder);
        if (folder.children.length > 0) {
          const disclosure = document.createElement("button");
          const open = expanded.has(folder.id);
          disclosure.className = "folder-disclosure";
          disclosure.type = "button";
          disclosure.textContent = "›";
          disclosure.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${title}`);
          disclosure.setAttribute("aria-expanded", String(open));
          disclosure.addEventListener("click", () => {
            if (open) expanded.delete(folder.id);
            else expanded.add(folder.id);
            render(latestState);
          });
          row.append(disclosure);
        } else {
          const spacer = document.createElement("span");
          spacer.className = "folder-disclosure-spacer";
          spacer.setAttribute("aria-hidden", "true");
          row.append(spacer);
        }
        const select = document.createElement("button");
        select.className = folder.id === selectedFolderId ? "folder-select active" : "folder-select";
        select.type = "button";
        select.textContent = title;
        select.title = title;
        select.dataset["folderId"] = folder.id;
        select.setAttribute("aria-current", folder.id === selectedFolderId ? "true" : "false");
        select.addEventListener("click", () => dependencies.selectFolder(folder.id));
        row.append(select);
        item.append(row);
        if (expanded.has(folder.id) && folder.children.length > 0) {
          const children = document.createElement("ul");
          appendFolders(children, folder.children, depth + 1);
          item.append(children);
        }
        parent.append(item);
      }
    };
    appendFolders(tree, folders, 0);
    content.push(tree);
    dependencies.root.replaceChildren(...content);
  };

  const render = (state: LibraryState): void => {
    if (disposed) return;
    latestState = state;
    switch (state.kind) {
      case "loading":
        dependencies.root.textContent = "Loading folders…";
        return;
      case "error":
        dependencies.root.textContent = "Folders unavailable";
        return;
      case "empty":
      case "ready":
        renderFolders(state.folders ?? [], state.selectedFolderId);
        return;
      default: {
        const exhaustiveState: never = state;
        return exhaustiveState;
      }
    }
  };

  return {
    render,
    dispose: () => { disposed = true; },
  };
}
