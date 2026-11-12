import type { ReactNode, Ref } from "react";
import styles from "./Button.module.css";

/** Primary for the screen's main action, secondary for the others, link for navigation. */
export type ButtonVariant = "primary" | "secondary" | "link" | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  link: styles.link,
  icon: styles.icon,
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
  /** A tooltip, for a button that shows an icon: its name is the hidden text beside it. */
  readonly title?: string;
  /** The ID of an element that says more, e.g. why the button is unusable. */
  readonly describedBy?: string | undefined;
  /**
   * For a button that shows and hides something: whether it's shown, as
   * `aria-expanded`. Undefined for any other button.
   */
  readonly expanded?: boolean;
  /** The ID of what the button shows and hides, while it's shown. */
  readonly controls?: string | undefined;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A button styled from the tokens, in one of four looks. */
export function Button(props: ButtonProps) {
  const { children, onClick, variant = "secondary", usable = true } = props;
  const { label, title, describedBy, expanded, controls, ref } = props;
  return (
    <button
      ref={ref}
      type="button"
      className={VARIANT_CLASSES[variant]}
      aria-disabled={!usable}
      aria-label={label}
      title={title}
      aria-describedby={describedBy}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={() => {
        if (usable) onClick();
      }}
    >
      {children}
    </button>
  );
}
