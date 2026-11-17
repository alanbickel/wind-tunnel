import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ZoomActions } from "../diagram/zoom-actions";
import { ZoomButtons } from "../diagram/ZoomButtons";
import { Button } from "../shared/Button";
import { ConnectIcon } from "../shared/RailIcons";
import styles from "./ToolRail.module.css";
import type { CanvasPanels } from "./useCanvasPanels";

export interface ToolRailProps {
  readonly panels: CanvasPanels;
  /** The diagram's zoom actions, once it has loaded; none with no boxes. */
  readonly zoom: ZoomActions | undefined;
}

/**
 * The tool rail down the canvas's left edge (UX design §2): the canvas's
 * view, zoom in, zoom out, and fit, then Connect, as a toolbar of icon
 * buttons. Nothing else floats over the canvas: the lists and editors are
 * the dock's. Connect opens a hint beside the rail, over the canvas, until
 * the connect hint on the canvas replaces it (slice 7 of issue 246); Escape, or
 * a click outside it, closes it, and Escape puts the focus back on
 * Connect.
 */
export function ToolRail({ panels, zoom }: ToolRailProps) {
  const hintId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<HTMLButtonElement>(null);
  useCloseOnOutsideClick(railRef, panels);
  return (
    <div
      ref={railRef}
      className={styles.rail}
      onKeyDown={(event) => {
        closeOnEscape({ event, panels, connectRef });
      }}
    >
      <div
        role="toolbar"
        aria-label="Tools"
        aria-orientation="vertical"
        className={styles.buttons}
        onKeyDown={moveBetweenButtons}
      >
        <ZoomButtons zoom={zoom} />
        <ConnectButton panels={panels} hintId={hintId} ref={connectRef} />
      </div>
      <ConnectPanel panels={panels} hintId={hintId} />
    </div>
  );
}

interface ConnectButtonProps {
  readonly panels: CanvasPanels;
  /** The hint's element id, which the button controls. */
  readonly hintId: string;
  readonly ref: RefObject<HTMLButtonElement | null>;
}

/** Connect: an icon button that opens and closes its hint; its name is hidden text. */
function ConnectButton({ panels, hintId, ref }: ConnectButtonProps) {
  const open = panels.open === "connect";
  return (
    <Button
      ref={ref}
      variant="icon"
      title="Connect"
      expanded={open}
      controls={open ? hintId : undefined}
      onClick={() => {
        panels.toggle("connect");
      }}
    >
      <ConnectIcon />
      <span className={styles.name}>Connect</span>
    </Button>
  );
}

type ConnectPanelProps = Omit<ConnectButtonProps, "ref">;

/** Connect's hint, beside the rail, while it's open. */
function ConnectPanel({ panels, hintId }: ConnectPanelProps) {
  return (
    <section
      id={hintId}
      aria-label="Connect"
      hidden={panels.open !== "connect"}
      className={styles.panel}
    >
      <ConnectHint />
    </section>
  );
}

/**
 * How to connect two components: a hint, not a mode. Connecting is
 * architecture only; a workflow's calls go only along the edges it makes.
 */
function ConnectHint() {
  return (
    <>
      <h4 className={styles.heading}>Connect two components</h4>
      <p>
        Drag from a box&rsquo;s handle to another box. From the keyboard, select
        a box and use &ldquo;Connect to…&rdquo; in its Details.
      </p>
    </>
  );
}

/** Closes the open hint when a press lands outside the rail. */
function useCloseOnOutsideClick(
  railRef: RefObject<HTMLElement | null>,
  panels: CanvasPanels,
): void {
  const { open, close } = panels;
  useEffect(() => {
    if (open === undefined) return;
    const onPress = (event: MouseEvent) => {
      const inside =
        event.target instanceof Node && railRef.current?.contains(event.target);
      if (!inside) close();
    };
    // Capture, so a canvas that stops the press from bubbling still closes it.
    document.addEventListener("mousedown", onPress, true);
    return () => {
      document.removeEventListener("mousedown", onPress, true);
    };
  }, [open, close, railRef]);
}

interface CloseOnEscapeInput {
  readonly event: KeyboardEvent<HTMLElement>;
  readonly panels: CanvasPanels;
  readonly connectRef: RefObject<HTMLButtonElement | null>;
}

/** Escape closes the open hint, focuses Connect, and goes no further. */
function closeOnEscape({ event, panels, connectRef }: CloseOnEscapeInput) {
  if (event.key !== "Escape" || panels.open === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  panels.close();
  connectRef.current?.focus();
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
