import { useId, type ReactNode } from "react";
import { Button } from "../../shared/Button";
import { Tabs } from "../../shared/Tabs";
import styles from "./Dock.module.css";
import type { OverlayProps } from "./overlay";
import { OVERLAY_KEYS, OVERLAYS } from "./overlays";
import type { OverlayKey } from "../screen/screen-state";

export interface DockProps extends OverlayProps {
  /**
   * The run group, at the end of the tab strip, when the layout puts it in
   * the dock: a wide window's. It stays when the dock folds.
   */
  readonly runGroup?: ReactNode;
}

/**
 * The dock along the bottom of the canvas, as wide as the window (UX
 * design §2, "The dock"). It holds the overlays that have something to
 * show, each in a tab, Library first, and the run group at the end of
 * their strip, after Fold. Library, Components, Workloads, and Workflows
 * are always there, so the dock never is nothing. Which tab shows and
 * whether it's folded are the screen's view state (`selecting.dock`),
 * which the dock reads and the user's changes go to. When the shown
 * overlay's tab isn't there, the first one left shows. Fold shrinks it to
 * one line, Unfold and the run group, and keeps every overlay mounted,
 * hidden, so a draft and the charts survive. A polite region always in it
 * says what a remove of a component, a connection, or a workload removed,
 * since the focus has left what changed and its tab may be hidden.
 */
export function Dock(props: DockProps) {
  const { runGroup, ...overlay } = props;
  const keys = OVERLAY_KEYS.filter((key) => OVERLAYS[key].shows(overlay));
  const [first] = keys;
  const { shown } = overlay.selecting.dock;
  const selected = keys.includes(shown) ? shown : (first ?? shown);
  return (
    <section aria-label="Dock" className={styles.dock}>
      <p role="status" className={styles.announcement}>
        {overlay.announcement}
      </p>
      <OverlayTabs
        overlay={overlay}
        tabs={keys}
        selected={selected}
        runGroup={runGroup}
      />
    </section>
  );
}

interface OverlayTabsProps {
  readonly overlay: OverlayProps;
  /** The overlays that show, in their tabs' order. */
  readonly tabs: readonly OverlayKey[];
  readonly selected: OverlayKey;
  readonly runGroup: ReactNode;
}

/**
 * The overlays' tabs, Fold right after them, then the run group at their
 * strip's end, or whole on a row of its own when it doesn't fit beside
 * them (UX design §2, "Window sizes"). Fold is there only while there's a
 * tab, so something to fold. The run group keeps its place in the tree as
 * tabs come and go, so it isn't mounted afresh and the focus stays on Run
 * when a run's tab appears.
 */
function OverlayTabs({ overlay, tabs, selected, runGroup }: OverlayTabsProps) {
  const { show, folded, fold } = overlay.selecting.dock;
  const panelsId = useId();
  return (
    <Tabs
      label="Dock overlays"
      selected={selected}
      onSelect={show}
      fold={{ folded: folded && tabs.length > 0, panelsId }}
      beside={
        tabs.length > 0 && (
          <FoldButton
            folded={folded}
            controls={panelsId}
            onToggle={() => {
              fold(!folded);
            }}
          />
        )
      }
      end={runGroup}
      tabs={tabs.map((key) => overlayTab(key, overlay))}
    />
  );
}

/** One overlay's tab: its label and what draws it, from the screen. */
function overlayTab(key: OverlayKey, overlay: OverlayProps) {
  const { label, Content } = OVERLAYS[key];
  return { id: key, label: label(overlay), content: <Content {...overlay} /> };
}

interface FoldButtonProps {
  readonly folded: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}

/** Folds the dock to its one line, or unfolds it. */
function FoldButton({ folded, controls, onToggle }: FoldButtonProps) {
  return (
    <Button
      label={folded ? "Unfold the dock" : "Fold the dock"}
      expanded={!folded}
      controls={controls}
      onClick={onToggle}
    >
      {folded ? "Unfold" : "Fold"}
    </Button>
  );
}
