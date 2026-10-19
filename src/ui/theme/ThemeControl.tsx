import { useId } from "react";
import { THEME_CHOICES, toThemeChoice, type ThemeChoice } from "./theme-choice";
import styles from "./ThemeControl.module.css";
import { useThemeChoice } from "./useThemeChoice";

const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

/** Picks the theme: the operating system's, dark, or light. */
export function ThemeControl() {
  const id = useId();
  const { choice, choose } = useThemeChoice();

  return (
    <div className={styles.control}>
      <label htmlFor={id}>Theme</label>
      <select
        id={id}
        value={choice}
        onChange={(event) => {
          choose(toThemeChoice(event.target.value));
        }}
      >
        {THEME_CHOICES.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
