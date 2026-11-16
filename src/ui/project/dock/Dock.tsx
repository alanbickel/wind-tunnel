import { useId, type ReactNode } from "react";
import { Button } from "../../shared/Button";
import { Tabs } from "../../shared/Tabs";
import styles from "./Dock.module.css";
import type { OverlayProps } from "./overlay";
import { OVERLAY_KEYS, OVERLAYS } from "./overlays";

/**
 * The dock along the bottom of the canvas, as wide as the window (UX
 * design §2, "The dock"). It holds the overlays that have something to
 * show, each in a tab, Run first, and nothing when none has. Which tab
 * shows and whether it's folded are the screen's view state
 * (`selecting.dock`), which the dock reads and the user's changes go
 * to. When the shown overlay's tab isn't there, the first one left
 * shows. Fold shrinks it to one line and keeps every overlay mounted,
 * hidden, so a draft and the charts survive.
 */
export function Dock(props: OverlayProps) {
  const { shown, show, folded, fold } = props.selecting.dock;
  const keys = OVERLAY_KEYS.filter((key) => OVERLAYS[key].shows(props));
  const [first] = keys;
  if (first === undefined) return null;
  const selected = keys.includes(shown) ? shown : first;
  return (
    <DockBand folded={folded} onFold={fold}>
      <Tabs
        label="Dock overlays"
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
