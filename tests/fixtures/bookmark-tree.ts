export const phaseOneBookmarkTree: readonly chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "root",
    title: "Bookmarks",
    children: [
      { id: "empty-before", title: "Empty before", children: [] },
      { id: "first", title: "First", url: "https://www.example.com/first/long/path" },
      { id: "second", title: "Second", url: "https://duplicate.example/item" },
      { id: "empty-between", title: "Empty between", children: [] },
      {
        id: "nested-folder",
        title: "Nested",
        children: [
          {
            id: "deep-folder",
            title: "Deep",
            children: [
              { id: "blank", title: "", url: "chrome://bookmarks/" },
              { id: "duplicate", title: "Duplicate", url: "https://duplicate.example/item" },
            ],
          },
        ],
      },
      { id: "empty-after", title: "Empty after", children: [] },
      { id: "last", title: "Last", url: "file:///Users/example/reference.pdf" },
    ],
  },
];

export const folderOnlyTree: readonly chrome.bookmarks.BookmarkTreeNode[] = [
  { id: "root", title: "Bookmarks", children: [{ id: "empty", title: "Empty", children: [] }] },
];
