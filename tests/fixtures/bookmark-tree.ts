export const phaseOneBookmarkTree: readonly chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "root",
    syncing: false,
    title: "Bookmarks",
    children: [
      { id: "empty-before", syncing: false, title: "Empty before", children: [] },
      {
        id: "first",
        syncing: false,
        title: "First",
        url: "https://www.example.com/first/long/path",
      },
      {
        id: "second",
        syncing: false,
        title: "Second",
        url: "https://duplicate.example/item",
      },
      { id: "empty-between", syncing: false, title: "Empty between", children: [] },
      {
        id: "nested-folder",
        syncing: false,
        title: "Nested",
        children: [
          {
            id: "deep-folder",
            syncing: false,
            title: "Deep",
            children: [
              { id: "blank", syncing: false, title: "", url: "chrome://bookmarks/" },
              {
                id: "duplicate",
                syncing: false,
                title: "Duplicate",
                url: "https://duplicate.example/item",
              },
            ],
          },
        ],
      },
      { id: "empty-after", syncing: false, title: "Empty after", children: [] },
      {
        id: "last",
        syncing: false,
        title: "Last",
        url: "file:///Users/example/reference.pdf",
      },
    ],
  },
];

export const folderOnlyTree: readonly chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "root",
    syncing: false,
    title: "Bookmarks",
    children: [{ id: "empty", syncing: false, title: "Empty", children: [] }],
  },
];
