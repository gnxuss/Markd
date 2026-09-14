import { parseTagInput } from "../tags/canonicalize.js";
import type { BookmarkRow, RowTagState, TagRecord } from "../types.js";
import type { LibraryElements, RenderElement } from "./render.js";

export type TagSuggestion =
  | { readonly kind: "existing"; readonly tag: TagRecord }
  | { readonly kind: "create"; readonly input: string; readonly label: string };

export type TagEditorActions = {
  readonly add: (bookmarkId: string, input: string) => void;
  readonly remove: (bookmarkId: string, tagKey: string) => void;
};

export type TagEditorNodes = {
  readonly tags: RenderElement;
  readonly form: RenderElement;
  readonly error?: RenderElement;
};

export function tagSuggestions(
  input: string,
  catalog: readonly TagRecord[],
): readonly TagSuggestion[] {
  const parsed = parseTagInput(input);
  if (parsed.kind === "invalid") return [];
  const exact = catalog.find((tag) => tag.key === parsed.tag.key);
  if (exact !== undefined) return [{ kind: "existing", tag: exact }];
  const matches = catalog
    .filter((tag) => tag.key.includes(parsed.tag.key))
    .map((tag) => ({ kind: "existing" as const, tag }));
  return [...matches, {
    kind: "create",
    input: parsed.tag.label,
    label: `Create “${parsed.tag.label}”`,
  }];
}

export function createTagEditor(
  row: BookmarkRow,
  tagState: RowTagState,
  catalog: readonly TagRecord[],
  elements: LibraryElements,
  actions: TagEditorActions,
): TagEditorNodes {
  const tags = elements.document.createElement("span");
  tags.className = "bookmark-tags";
  elements.document.setAttribute(tags, "aria-label", "Tags");
  for (const tag of row.tags) {
    const chip = elements.document.createElement("span");
    chip.className = "tag-chip";
    const label = elements.document.createElement("span");
    label.textContent = tag.label;
    const remove = elements.document.createElement("button");
    remove.className = "tag-remove";
    remove.textContent = "×";
    elements.document.setAttribute(remove, "type", "button");
    elements.document.setAttribute(remove, "aria-label", `Remove ${tag.label}`);
    elements.document.addEventListener(remove, "click", (event) => {
      event.preventDefault();
      actions.remove(row.id, tag.key);
    });
    elements.document.append(chip, [label, remove]);
    elements.document.append(tags, [chip]);
  }

  const form = elements.document.createElement("form");
  form.className = "tag-editor";
  elements.document.setAttribute(form, "aria-busy", String(tagState.kind === "saving"));
  const input = elements.document.createElement("input");
  input.className = "tag-input";
  elements.document.setAttribute(input, "aria-label", `Add tag to ${row.title || "Untitled bookmark"}`);
  elements.document.setAttribute(input, "autocomplete", "off");
  elements.document.setAttribute(input, "value", tagState.input);
  const options = elements.document.createElement("div");
  options.className = "tag-suggestions";
  elements.document.setAttribute(options, "role", "listbox");
  let optionsMounted = false;

  const renderOptions = (inputValue: string): void => {
    const suggestions = tagSuggestions(inputValue, catalog);
    const optionNodes = suggestions.map((suggestion) => {
      const option = elements.document.createElement("button");
      option.className = "tag-suggestion";
      elements.document.setAttribute(option, "type", "button");
      elements.document.setAttribute(option, "role", "option");
      elements.document.setAttribute(option, "data-kind", suggestion.kind);
      const selectedInput = suggestion.kind === "existing" ? suggestion.tag.label : suggestion.input;
      option.textContent = suggestion.kind === "existing" ? suggestion.tag.label : suggestion.label;
      elements.document.addEventListener(option, "click", (event) => {
        event.preventDefault();
        actions.add(row.id, selectedInput);
      });
      return option;
    });
    elements.document.replaceChildren(options, optionNodes);
    if (suggestions.length > 0 && !optionsMounted) {
      elements.document.append(form, [options]);
      optionsMounted = true;
    } else if (suggestions.length === 0 && optionsMounted) {
      elements.document.remove?.(options);
      optionsMounted = false;
    }
  };

  elements.document.addEventListener(input, "input", () => {
    renderOptions(elements.document.value?.(input) ?? "");
  });
  elements.document.addEventListener(form, "submit", (event) => {
    event.preventDefault();
    const inputValue = elements.document.value?.(input) ?? "";
    const first = tagSuggestions(inputValue, catalog)[0];
    actions.add(
      row.id,
      first === undefined
        ? inputValue
        : first.kind === "existing" ? first.tag.label : first.input,
    );
  });
  const submit = elements.document.createElement("button");
  submit.className = "tag-submit";
  submit.textContent = "Add";
  elements.document.setAttribute(submit, "type", "submit");
  elements.document.append(form, [input, submit]);
  renderOptions(tagState.input);
  if (tagState.focus) elements.document.focus?.(input);

  if (tagState.kind !== "error") return { tags, form };
  const error = elements.document.createElement("span");
  error.className = "tag-error";
  error.textContent = tagState.message;
  elements.document.setAttribute(error, "role", "status");
  return { tags, form, error };
}
