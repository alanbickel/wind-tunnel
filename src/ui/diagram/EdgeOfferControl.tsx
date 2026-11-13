import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "../shared/Button";
import type { EdgeOffer } from "./diagram-model";
import styles from "./Diagram.module.css";

export interface EdgeOfferControlProps {
  readonly offer: EdgeOffer;
}

/**
 * The question an open popover is asking, wrapped so a function can be
 * state, with the offer's `onUse` it came from: once the offer is replaced
 * (the selection or the project changed), the question is stale and closes.
 */
interface Asking {
  readonly render: (close: () => void) => ReactNode;
  readonly source: EdgeOffer["onUse"];
}

/**
 * An arrow's offer: a "+" button named for what it does, which does it, or,
 * when the offer has a question first, opens a popover with it. Pressing
 * the button again, or Escape from the button or the popover, closes the
 * popover and returns the focus to the button, doing nothing. So does a
 * change to the offer while it's open.
 */
export function EdgeOfferControl({ offer }: EdgeOfferControlProps) {
  const { buttonRef, asking, close, use } = useQuestion(offer);
  return (
    // The key handler is on the wrapper, so Escape works from the button too.
    <div
      onKeyDown={(event) => {
        if (asking) closeOnEscape(event, close);
      }}
    >
      <Button
        ref={buttonRef}
        label={offer.label}
        title={offer.label}
        expanded={asking === undefined ? undefined : true}
        onClick={use}
      >
        +
      </Button>
      {asking && (
        <Question label={offer.label}>{asking.render(close)}</Question>
      )}
    </div>
  );
}

/** What the control holds: its button, the open question, and what pressing the button does. */
interface QuestionState {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly asking: Asking | undefined;
  readonly close: () => void;
  readonly use: () => void;
}

/** The open question, closed by pressing the button again, or opened by using the offer. */
function useQuestion(offer: EdgeOffer): QuestionState {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [opened, setAsking] = useState<Asking>();
  const asking = opened?.source === offer.onUse ? opened : undefined;
  const close = useClosing({ setAsking, buttonRef });
  const use = () => {
    if (asking !== undefined) {
      close();
      return;
    }
    const render = offer.onUse();
    setAsking(render && { render, source: offer.onUse });
  };
  return { buttonRef, asking, close, use };
}

/** What closing the question sets, and the button the focus returns to. */
interface ClosingInput {
  readonly setAsking: (asking: Asking | undefined) => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}

/**
 * A function that closes the question and then, once it has drawn closed,
 * returns the focus to the button. The focus waits for an effect, because
 * the question's own controls have it until they're gone.
 */
function useClosing({ setAsking, buttonRef }: ClosingInput): () => void {
  const [closings, setClosings] = useState(0);
  useEffect(() => {
    if (closings > 0) buttonRef.current?.focus();
  }, [closings, buttonRef]);
  return useCallback(() => {
    setAsking(undefined);
    setClosings((count) => count + 1);
  }, [setAsking]);
}

interface QuestionProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** The popover: a group named for the offer. */
function Question({ label, children }: QuestionProps) {
  return (
    <div role="group" aria-label={label} className={styles.offerQuestion}>
      {children}
    </div>
  );
}

/** Escape closes the question, and goes no further: it isn't the canvas's. */
function closeOnEscape(event: KeyboardEvent, close: () => void): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
