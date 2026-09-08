export type BookmarkRow = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly tags: readonly string[];
};

export type RowOpenState =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "error"; readonly message: string };

export type LibraryState =
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "ready";
      readonly rows: readonly BookmarkRow[];
      readonly rowStates: Readonly<Record<string, RowOpenState>>;
    }
  | { readonly kind: "error"; readonly message: string };
