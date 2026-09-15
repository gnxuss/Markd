import { resolveTagInput } from "../tags/canonicalize.js";
import type { TagRecord } from "../types.js";
import type { BulkOrganization } from "./bulk-organization.js";
import type { LibraryElements, RenderElement } from "./render.js";

function actionButton(
  label: string,
  className: string,
  elements: LibraryElements,
  action: () => void,
  disabled: boolean,
): RenderElement {
  const button = elements.document.createElement("button");
  button.className = className;
  button.textContent = label;
  elements.document.setAttribute(button, "type", "button");
  if (disabled) elements.document.setAttribute(button, "disabled", "");
  elements.document.addEventListener(button, "click", action);
  return button;
}

export function createBulkControls(
  bulk: BulkOrganization,
  catalog: readonly TagRecord[],
  elements: LibraryElements,
): RenderElement {
  const state = bulk.state();
  const controls = elements.document.createElement("section");
  controls.className = "bulk-controls";
  elements.document.setAttribute(controls, "aria-label", "Bulk organization");
  const mode = actionButton(state.mode ? "Done" : "Select", "selection-mode-toggle", elements, () => {
    if (state.mode) bulk.exit();
    else bulk.enter();
  }, state.status === "saving");
  elements.document.append(controls, [mode]);
  if (!state.mode) return controls;

  const count = elements.document.createElement("span");
  count.className = "selection-count";
  count.textContent = `${state.selectedIds.length} selected`;
  const form = elements.document.createElement("form");
  form.className = "bulk-tag-form";
  const input = elements.document.createElement("input");
  input.className = "bulk-tag-input";
  elements.document.setAttribute(input, "aria-label", "Stage tag for selected bookmarks");
  elements.document.setAttribute(input, "autocomplete", "off");
  elements.document.addEventListener(form, "submit", (event) => {
    event.preventDefault();
    const resolution = resolveTagInput(elements.document.value?.(input) ?? "", catalog);
    if (resolution.kind !== "invalid") bulk.stage(resolution.tag);
  });
  const stage = actionButton("Stage", "bulk-stage", elements, () => undefined, false);
  elements.document.setAttribute(stage, "type", "submit");
  elements.document.append(form, [input, stage]);

  const chips = elements.document.createElement("span");
  chips.className = "bulk-staged-tags";
  for (const tag of state.stagedTags) {
    const chip = actionButton(`#${tag.label} ×`, "bulk-tag-chip", elements, () => bulk.unstage(tag.key), false);
    elements.document.setAttribute(chip, "aria-label", `Remove staged ${tag.label}`);
    elements.document.append(chips, [chip]);
  }
  const inactive = state.status === "saving" || state.selectedIds.length === 0 || state.stagedTags.length === 0;
  const hasUnconfirmed = state.stagedTags.some((tag) => !catalog.some((candidate) => candidate.key === tag.key));
  const add = actionButton("Add tags", "bulk-add", elements, () => { void bulk.apply("add"); }, inactive);
  const remove = actionButton("Remove tags", "bulk-remove", elements, () => { void bulk.apply("remove"); }, inactive || hasUnconfirmed);
  const clear = actionButton("Clear selection", "bulk-clear", elements, bulk.clear, state.status === "saving" || state.selectedIds.length === 0);
  const moveLabel = elements.document.createElement("label");
  moveLabel.className = "bulk-move-label";
  moveLabel.textContent = "Move to";
  const destination = elements.document.createElement("select");
  destination.className = "bulk-tag-input bulk-move-folder";
  elements.document.setAttribute(destination, "aria-label", "Move selected bookmarks to folder");
  const placeholder = elements.document.createElement("option");
  placeholder.textContent = "Choose folder";
  elements.document.setAttribute(placeholder, "value", "");
  elements.document.append(destination, [placeholder]);
  for (const folder of bulk.moveDestinations()) {
    const option = elements.document.createElement("option");
    option.textContent = folder.label;
    elements.document.setAttribute(option, "value", folder.id);
    elements.document.append(destination, [option]);
  }
  elements.document.setValue?.(destination, state.destinationId);
  if (state.status === "saving") elements.document.setAttribute(destination, "disabled", "");
  elements.document.addEventListener(destination, "change", () => {
    bulk.setDestination(elements.document.value?.(destination) ?? "");
  });
  const move = actionButton(
    state.status === "saving" ? "Moving…" : "Move bookmarks",
    "bulk-add bulk-move-submit",
    elements,
    () => { void bulk.move(); },
    state.status === "saving" || state.selectedIds.length === 0 || state.destinationId.length === 0,
  );
  const status = elements.document.createElement("span");
  status.className = state.status === "error" ? "bulk-status error" : "bulk-status";
  status.textContent = state.message;
  elements.document.setAttribute(status, "role", "status");
  elements.document.append(controls, [count, form, chips, add, remove, moveLabel, destination, move, clear, status]);
  return controls;
}
