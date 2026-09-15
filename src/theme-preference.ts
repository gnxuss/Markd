export type Theme = "light" | "dark";

type ThemeReader = {
  readonly getItem: (key: string) => string | null;
};

type ThemeWriter = ThemeReader & {
  readonly setItem: (key: string, value: string) => void;
};

type ThemeRoot = {
  readonly dataset: DOMStringMap;
};

export const THEME_STORAGE_KEY = "markd-theme";

export function readTheme(storage: ThemeReader): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function applyTheme(theme: Theme, root: ThemeRoot = document.documentElement): void {
  root.dataset["theme"] = theme;
}

export function restoreTheme(
  storage: ThemeReader = localStorage,
  root: ThemeRoot = document.documentElement,
): Theme {
  const theme = readTheme(storage);
  applyTheme(theme, root);
  return theme;
}

export function persistTheme(
  theme: Theme,
  storage: ThemeWriter = localStorage,
  root: ThemeRoot = document.documentElement,
): void {
  storage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme, root);
}
