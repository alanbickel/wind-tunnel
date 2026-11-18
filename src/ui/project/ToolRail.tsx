import { useCallback, type KeyboardEvent } from "react";
import type { ZoomActions } from "../diagram/zoom-actions";
import { ZoomButtons } from "../diagram/ZoomButtons";
import styles from "./ToolRail.module.css";

export interface ToolRailProps {
  /** The diagram's zoom actions, once it has loaded; none with no boxes. */
  readonly zoom: ZoomActions | undefined;
  /**
   * Called with how far from the canvas's left edge the rail covers it,
   * with the same gap again beyond it, so a fit can keep the boxes clear.
   */
  readonly onInset?: ((leftInsetPx: number) => void) | undefined;
}

/**
 * The tool rail down the canvas's left edge (UX design §2): the canvas's
 * view, zoom out, zoom in, and fit, as a toolbar of icon buttons. Nothing
 * else floats over the canvas: the lists and editors are the dock's, and
 * the canvas says how to connect boxes itself.
 */
export function ToolRail({ zoom, onInset }: ToolRailProps) {
  return (
    <div
      ref={useInsetMeasure(onInset)}
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
      className={styles.rail}
      onKeyDown={moveBetweenButtons}
    >
      <ZoomButtons zoom={zoom} />
    </div>
  );
}

/**
 * A ref that measures the toolbar once it's drawn: its left offset in the
 * canvas, its width, and the same gap again on its right. It's measured
 * once, since its size is set in rem and doesn't change with the window.
 */
function useInsetMeasure(onInset: ToolRailProps["onInset"]) {
  return useCallback(
    (toolbar: HTMLDivElement | null) => {
      if (toolbar === null) return;
      onInset?.(2 * toolbar.offsetLeft + toolbar.offsetWidth);
    },
    [onInset],
  );
}

/** The arrow keys move between the toolbar's buttons. */
const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
};

function moveBetweenButtons(event: KeyboardEvent<HTMLElement>): void {
  const step = ARROW_STEPS[event.key];
  if (step === undefined) return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (from < 0) return;
  event.preventDefault();
  buttons[(from + step + buttons.length) % buttons.length]?.focus();
}
