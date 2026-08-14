import type { Theme } from "./theme";

// Reference palette from the dataviz skill (unmodified hex values). Categorical order is
// fixed and never cycled: identity here also always carries a direct text label, so
// hue-alone confusability past three slots isn't load-bearing. Kept the same across
// themes — these are already saturated accent colors chosen to read on a neutral
// background, not chrome that needs a dark counterpart.
export const CATEGORICAL = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export const STATUS = {
  delivered: "#0ca30c", // good
  pledged: "#fab219", // warning
};

export interface ChromeColors {
  surface: string;
  primaryInk: string;
  secondaryInk: string;
  mutedInk: string;
  gridline: string;
  baseline: string;
}

export const CHROME_LIGHT: ChromeColors = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
};

export const CHROME_DARK: ChromeColors = {
  surface: "#1a1b1e",
  primaryInk: "#f0efec",
  secondaryInk: "#b7b5af",
  mutedInk: "#7d7c78",
  gridline: "#303136",
  baseline: "#45464c",
};

export function chromeFor(theme: Theme): ChromeColors {
  return theme === "dark" ? CHROME_DARK : CHROME_LIGHT;
}

export function categoricalColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length] ?? CHROME_LIGHT.mutedInk;
}
