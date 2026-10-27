import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Whether a confirmation is open, and how to open and cancel it. */
export interface Confirming {
  readonly open: boolean;
  readonly ask: () => void;
  /** Closes the confirmation, and returns the focus to its opener. */
  readonly cancel: () => void;
}

/**
 * A confirmation's state. Its opener, the button `openerRef` holds, is
 * off the page while it's open, so Cancel returns the focus to it once
 * it's back.
 */
export function useConfirming(
  openerRef: RefObject<HTMLButtonElement | null>,
): Confirming {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    openerRef.current?.focus();
  }, [open, openerRef]);
  const ask = useCallback(() => {
    setOpen(true);
  }, []);
  const cancel = useCallback(() => {
    returnFocus.current = true;
    setOpen(false);
  }, []);
  return { open, ask, cancel };
}
