import { useCallback, useState } from "react";
import {
  chooseTheme,
  savedThemeChoice,
  type ThemeChoice,
} from "./theme-choice";

export interface ThemeChoiceState {
  readonly choice: ThemeChoice;
  /** Shows the page in `choice`'s theme and saves it. */
  readonly choose: (choice: ThemeChoice) => void;
}

/**
 * The user's theme choice. It starts from the saved one, which `main.tsx`
 * has already applied, so the first render needs no change to the page.
 */
export function useThemeChoice(): ThemeChoiceState {
  const [choice, setChoice] = useState(savedThemeChoice);
  const choose = useCallback((next: ThemeChoice) => {
    chooseTheme(next);
    setChoice(next);
  }, []);
  return { choice, choose };
}
