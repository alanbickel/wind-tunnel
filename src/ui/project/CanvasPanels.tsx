import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../shared/Button";
import styles from "./CanvasPanels.module.css";
import {
  CANVAS_PANEL_ATTRIBUTE,
  type CanvasPanelId,
  type CanvasPanels as PanelState,
} from "./useCanvasPanels";

export interface CanvasPanelsProps {
  readonly panels: PanelState;
  /** The workflows list, in the "Workflows" panel. */
  readonly workflows: ReactNode;
  /** The diagram's text version, in the "As text" panel; none without components. */
  readonly text: ReactNode;
  /** What a workflow's remove announces: "Removed Get order." */
  readonly announcement: string;
}

/** One panel: its button's text, the name of its region, and what it holds. */
interface PanelEntry {
  readonly id: CanvasPanelId;
  readonly button: string;
  readonly label: string;
  readonly content: ReactNode;
}

/** Each panel's element id, which its button controls. */
type PanelIds = (id: CanvasPanelId) => string;

/**
 * "Workflows" and "As text" at the canvas's bottom left, each opening its
 * panel over the canvas, above the buttons. Each button shows whether its
 * panel is open (`aria-expanded`); Escape anywhere in the corner closes the
 * open one and puts the focus back on its button. A closed panel stays
 * mounted, hidden, so its scroll is still there when it opens. A live
 * region in a hidden panel says nothing, so a workflow's remove is said
 * from a polite region beside the buttons, which always show, on the page
 * from the start, empty.
 */
export function CanvasPanels(props: CanvasPanelsProps) {
  const { panels, workflows, text } = props;
  const baseId = useId();
  const ids: PanelIds = (id) => `${baseId}-${id}`;
  const entries = panelEntries({ workflows, text });
  return (
    <div
      className={styles.corner}
      onKeyDown={(event) => {
        closeOnEscape({ event, panels, ids });
      }}
    >
      {entries.map(({ id, label, content }) => (
        <PanelBody
          key={id}
          id={id}
          elementId={ids(id)}
          label={label}
          open={panels.open === id}
        >
          {content}
        </PanelBody>
      ))}
      <PanelButtons {...props} entries={entries} ids={ids} />
    </div>
  );
}

interface PanelButtonsProps extends Pick<
  CanvasPanelsProps,
  "panels" | "announcement"
> {
  readonly entries: readonly PanelEntry[];
  readonly ids: PanelIds;
}

/** The panels' buttons, in a row, and the region a workflow's remove speaks from. */
function PanelButtons({
  entries,
  ids,
  panels,
  announcement,
}: PanelButtonsProps) {
  return (
    <div className={styles.buttons}>
      {entries.map((entry) => (
        <PanelButton key={entry.id} entry={entry} ids={ids} panels={panels} />
      ))}
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </div>
  );
}

type PanelContents = Pick<CanvasPanelsProps, "workflows" | "text">;

/** The panels there are: "As text" only while it has a text version. */
function panelEntries({ workflows, text }: PanelContents): PanelEntry[] {
  const all: PanelEntry[] = [
    {
      id: "workflows",
      button: "Workflows",
      label: "Workflows",
      content: workflows,
    },
    {
      id: "text",
      button: "As text",
      label: "Components, connections, and paths as text",
      content: text,
    },
  ];
  return all.filter(({ content }) => content !== undefined);
}

interface PanelBodyProps {
  readonly id: CanvasPanelId;
  readonly elementId: string;
  /** Names the panel's region for screen readers. */
  readonly label: string;
  readonly open: boolean;
  readonly children: ReactNode;
}

/**
 * One panel: a region that scrolls, and so takes a tab stop. It names its
 * panel in `CANVAS_PANEL_ATTRIBUTE`, so `reveal` can open it.
 */
function PanelBody({ id, elementId, label, open, children }: PanelBodyProps) {
  return (
    <section
      id={elementId}
      {...{ [CANVAS_PANEL_ATTRIBUTE]: id }}
      aria-label={label}
      hidden={!open}
      tabIndex={0}
      className={styles.panel}
    >
      {children}
    </section>
  );
}

interface PanelButtonProps {
  readonly entry: PanelEntry;
  readonly ids: PanelIds;
  readonly panels: PanelState;
}

/** The button that opens and closes one panel. */
function PanelButton({ entry, ids, panels }: PanelButtonProps) {
  const open = panels.open === entry.id;
  return (
    <Button
      expanded={open}
      controls={open ? ids(entry.id) : undefined}
      onClick={() => {
        panels.toggle(entry.id);
      }}
    >
      {entry.button}
    </Button>
  );
}

interface CloseOnEscapeInput {
  readonly event: KeyboardEvent<HTMLElement>;
  readonly panels: PanelState;
  readonly ids: PanelIds;
}

/**
 * Escape closes the open panel and focuses its button, the one that
 * controls it, and goes no further.
 */
function closeOnEscape({ event, panels, ids }: CloseOnEscapeInput): void {
  const { open } = panels;
  if (event.key !== "Escape" || open === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget.querySelector<HTMLElement>(
    `[aria-controls="${ids(open)}"]`,
  );
  panels.close();
  button?.focus();
}
