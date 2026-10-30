import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { RemovalText } from "../../application/details/details";
import { Button } from "../shared/Button";
import styles from "./SelectionDetails.module.css";

export interface RemoveConfirmationProps {
  readonly text: RemovalText;
  readonly onConfirm: () => void;
  /** On Cancel, and on Escape. */
  readonly onCancel: () => void;
}

/**
 * Asks before a remove, naming what it takes and the steps it leaves that
 * can't run (UX design §2.4 steps 4 and 5). A screen reader reads the
 * question and the warning as the group's name and description.
 */
export function RemoveConfirmation(props: RemoveConfirmationProps) {
  const { text, onCancel } = props;
  const questionId = useId();
  const warningId = useId();
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      aria-describedby={text.warning === undefined ? undefined : warningId}
      className={styles.confirmation}
      onKeyDown={(event) => {
        cancelOnEscape(event, onCancel);
      }}
    >
      <p id={questionId} className={styles.question}>
        {text.question}
      </p>
      {text.warning !== undefined && (
        <p id={warningId} className={styles.warning}>
          {text.warning}
        </p>
      )}
      <ConfirmationButtons {...props} />
    </div>
  );
}

/**
 * Remove and Cancel. The focus moves to Cancel, so an Enter pressed by
 * mistake keeps the component.
 */
function ConfirmationButtons({ onConfirm, onCancel }: RemoveConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div className={styles.actions}>
      <Button variant="primary" onClick={onConfirm}>
        Remove
      </Button>
      <Button ref={cancelRef} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** Escape cancels, and goes no further, so it doesn't close Details too. */
function cancelOnEscape(
  event: KeyboardEvent<HTMLElement>,
  onCancel: () => void,
): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  onCancel();
}
