import { useId, useState, type ReactNode } from "react";
import { Button } from "../../shared/Button";
import { Tabs } from "../../shared/Tabs";
import styles from "./Dock.module.css";
import type { OverlayProps } from "./overlay";
import type { OverlayKey, OverlayRequest } from "./overlay-request";
import { OVERLAY_KEYS, OVERLAYS } from "./overlays";

/** What the dock's overlays read, and the screen's latest ask for one. */
export interface DockProps extends OverlayProps {
  /**
   * The latest ask for an overlay (`useDockRequests`): a new object for
   * each ask, a repeat of the last included, so each one is seen.
   */
  readonly request: OverlayRequest | undefined;
}

/**
 * The dock along the bottom of the canvas, as wide as the window (UX
 * design §2, "The dock"). It holds the overlays that have something to
 * show, each in a tab, Run first, and nothing when none has. It decides
 * which shows and whether it's folded: an ask shows that overlay's tab,
 * unfolded, and switching tabs changes nothing else. When the shown
 * overlay's tab goes, the first one left shows. Fold shrinks it to one
 * line and keeps every overlay mounted, hidden, so a draft and the charts
 * survive.
 */
export function Dock(props: DockProps) {
  const { shown, show, folded, fold } = useDockState(props.request);
  const keys = OVERLAY_KEYS.filter((key) => OVERLAYS[key].shows(props));
  const [first] = keys;
  if (first === undefined) return null;
  const selected = keys.includes(shown) ? shown : first;
  return (
    <DockBand folded={folded} onFold={fold}>
      <Tabs
        label="Dock"
        selected={selected}
        onSelect={show}
        tabs={keys.map((key) => {
          const { label, Content } = OVERLAYS[key];
          return {
            id: key,
            label: label(props),
            content: <Content {...props} />,
          };
        })}
      />
    </DockBand>
  );
}

/** Which overlay the dock shows, whether it's folded, and how to change them. */
interface DockState {
  readonly shown: OverlayKey;
  readonly show: (key: OverlayKey) => void;
  readonly folded: boolean;
  readonly fold: (folded: boolean) => void;
}

/**
 * The dock's own state, which a new ask moves to the asked-for overlay,
 * unfolded. Derived while drawing, so the overlay shows in the same
 * render as the ask, before its focus request runs.
 */
function useDockState(request: OverlayRequest | undefined): DockState {
  const [shown, show] = useState<OverlayKey>("run");
  const [folded, fold] = useState(false);
  const [seen, setSeen] = useState(request);
  if (seen !== request) {
    setSeen(request);
    if (request !== undefined) {
      show(request.key);
      fold(false);
    }
  }
  return { shown, show, folded, fold };
}

interface DockBandProps {
  readonly folded: boolean;
  readonly onFold: (folded: boolean) => void;
  readonly children: ReactNode;
}

/** The dock's box: Fold, then what it holds, hidden while folded. */
function DockBand({ folded, onFold, children }: DockBandProps) {
  const bodyId = useId();
  return (
    <section aria-label="Dock" className={styles.dock}>
      <FoldButton
        folded={folded}
        controls={bodyId}
        onToggle={() => {
          onFold(!folded);
        }}
      />
      <div id={bodyId} hidden={folded} className={styles.body}>
        {children}
      </div>
    </section>
  );
}

interface FoldButtonProps {
  readonly folded: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}

/** Folds the dock to this one line, or unfolds it. */
function FoldButton({ folded, controls, onToggle }: FoldButtonProps) {
  return (
    <div className={styles.bar}>
      <Button
        label={folded ? "Unfold the dock" : "Fold the dock"}
        expanded={!folded}
        controls={controls}
        onClick={onToggle}
      >
        {folded ? "Unfold" : "Fold"}
      </Button>
    </div>
  );
}
