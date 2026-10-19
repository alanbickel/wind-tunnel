/** Follow the operating system's light or dark setting, or fix one. */
export type ThemeChoice = "system" | "dark" | "light";

/** Every choice, in the order the theme control offers them. */
export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "dark",
  "light",
];

const STORAGE_KEY = "wind-tunnel.theme";
// tokens.css maps this attribute on <html> to its color-scheme.
const THEME_ATTRIBUTE = "data-theme";

/** `value` as a choice; anything else (a stale or edited value) is "system". */
export function toThemeChoice(value: string | null): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? "system";
}

/**
 * The saved choice, or "system" if there is none. A browser that blocks
 * storage throws on access; that counts as none, so startup carries on.
 */
export function savedThemeChoice(): ThemeChoice {
  try {
    return toThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Shows the page in `choice`'s theme, without saving it. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }
  root.setAttribute(THEME_ATTRIBUTE, choice);
}

/** Shows the page in `choice`'s theme and saves it for the next visit. */
export function chooseTheme(choice: ThemeChoice): void {
  applyThemeChoice(choice);
  try {
    saveThemeChoice(choice);
  } catch {
    // Storage is blocked or full: the choice lasts until the page reloads.
  }
}

/** Saving "system" clears the saved choice, so the page follows the OS again. */
function saveThemeChoice(choice: ThemeChoice): void {
  if (choice === "system") {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, choice);
}
