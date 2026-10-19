import type { ReactNode, Ref } from "react";
import styles from "./Button.module.css";

/** Primary for the screen's main action, link for navigation. */
export type ButtonVariant = "primary" | "secondary" | "link";

const VARIANT_CLASSES: Record<ButtonVariant, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  link: styles.link,
};

export interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  /** Secondary by default. */
  readonly variant?: ButtonVariant;
  /**
   * When false, the button says it's unavailable and ignores clicks. It uses
   * `aria-disabled`, not `disabled`, because disabling the focused button
   * would drop the keyboard focus. True by default.
   */
  readonly usable?: boolean;
  /** Names the button for screen readers when its text alone is ambiguous. */
  readonly label?: string;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A button styled from the tokens, in one of three looks. */
export function Button({
  children,
  onClick,
  variant = "secondary",
  usable = true,
  label,
  ref,
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={VARIANT_CLASSES[variant]}
      aria-disabled={!usable}
      aria-label={label}
      onClick={() => {
        if (usable) onClick();
      }}
    >
      {children}
    </button>
  );
}
