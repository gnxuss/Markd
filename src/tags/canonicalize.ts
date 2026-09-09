import type { TagRecord } from "../types.js";

export type ParsedTagInput =
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly tag: TagRecord };

export type ResolvedTagInput =
  | { readonly kind: "invalid" }
  | { readonly kind: "accepted"; readonly tag: TagRecord }
  | { readonly kind: "existing"; readonly tag: TagRecord };

export function parseTagInput(input: string): ParsedTagInput {
  const label = input.trim().normalize("NFC");
  if (label.length === 0) return { kind: "invalid" };
  return { kind: "valid", tag: { key: label.toLowerCase(), label } };
}

export function resolveTagInput(
  input: string,
  catalog: readonly TagRecord[],
): ResolvedTagInput {
  const parsed = parseTagInput(input);
  if (parsed.kind === "invalid") return parsed;
  const existing = catalog.find((tag) => tag.key === parsed.tag.key);
  return existing === undefined
    ? { kind: "accepted", tag: parsed.tag }
    : { kind: "existing", tag: existing };
}
