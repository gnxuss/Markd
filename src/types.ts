export type TagRecord = {
  readonly key: string;
  readonly label: string;
};

export type TagAssignments = Readonly<Record<string, readonly TagRecord[]>>;
export type LibraryView = "all" | "untagged";
export type RetrievalCriteria = {
  readonly query: string;
  readonly selectedTagKeys: readonly string[];
};

export type BookmarkRow = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly tags: readonly TagRecord[];
};

export type RowOpenState =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "error"; readonly message: string };

export type RowTagState =
  | { readonly kind: "idle"; readonly input: string; readonly focus: boolean }
  | { readonly kind: "saving"; readonly input: string; readonly focus: boolean }
  | {
      readonly kind: "error";
      readonly input: string;
      readonly focus: boolean;
      readonly message: string;
    };

export type LibraryState =
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "ready";
      readonly rows: readonly BookmarkRow[];
      readonly view: LibraryView;
      readonly query: string;
      readonly selectedTagKeys: readonly string[];
      readonly catalog: readonly TagRecord[];
      readonly rowStates: Readonly<Record<string, RowOpenState>>;
      readonly tagStates: Readonly<Record<string, RowTagState>>;
    }
  | { readonly kind: "error"; readonly message: string };
