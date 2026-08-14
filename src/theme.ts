export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

function systemTheme(): Theme {
  return media.matches ? "dark" : "light";
}

/** The effective theme: an explicit user override if one's been set, otherwise the OS preference. */
export function getTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Stamps `data-theme` on the root element, which drives both the CSS custom properties and the canvas chrome colors. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Applies and persists an explicit choice, so it sticks even if the OS preference later changes. */
export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/** Notifies `onChange` with the new system theme whenever it flips — but only while no explicit override is stored, so a manual choice isn't silently overridden. */
export function watchSystemTheme(onChange: (theme: Theme) => void): void {
  media.addEventListener("change", () => {
    if (storedTheme() === null) onChange(systemTheme());
  });
}
