import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import styles from "./Explained.module.css";

export interface ExplainedProps {
  /** What's explained, such as a heading; the info control sits beside it. */
  readonly title: ReactNode;
  /** Names the control "About <subject>", so each one says what it explains. */
  readonly subject: string;
  /**
   * The id of what the control should be described by, such as the text it
   * explains, when the subject alone doesn't say which one it is.
   */
  readonly describedBy?: string;
  /** The explanation, hidden until the control opens it. */
  readonly children: ReactNode;
}

/**
 * A title with an info control that shows and hides its explanation. The
 * control is a real button, so the keyboard reaches it: Enter and Space
 * toggle it, and Escape closes it from the button or the explanation,
 * putting the focus back on the button. Not a hover tooltip, which
 * keyboard and screen-reader users can't reach.
 */
export function Explained(props: ExplainedProps) {
  const { title, subject, describedBy, children } = props;
  const { open, toggle, closeOnEscape, button } = useDisclosure();
  const explanationId = useId();

  return (
    <div onKeyDown={closeOnEscape}>
      <div className={styles.title}>
        {title}
        <button
          ref={button}
          type="button"
          className={styles.control}
          aria-label={`About ${subject}`}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-controls={explanationId}
          onClick={toggle}
        >
          i
        </button>
      </div>
      <div id={explanationId} hidden={!open} className={styles.explanation}>
        {children}
      </div>
    </div>
  );
}

/** Whether the explanation is open, and the ways to change that. */
interface Disclosure {
  readonly open: boolean;
  readonly toggle: () => void;
  /** Closes on Escape, from anywhere inside, and focuses the button; the Escape goes no further. */
  readonly closeOnEscape: (event: KeyboardEvent) => void;
  readonly button: RefObject<HTMLButtonElement | null>;
}

function useDisclosure(): Disclosure {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return {
    open,
    toggle: () => {
      setOpen((wasOpen) => !wasOpen);
    },
    closeOnEscape: (event) => {
      if (event.key !== "Escape" || !open) return;
      // Handled here, so a dialog or panel around this one stays open.
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    },
    button,
  };
}
