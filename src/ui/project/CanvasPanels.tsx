import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { ZoomActions } from "../diagram/zoom-actions";
import { ZoomButtons } from "../diagram/ZoomButtons";
import { Button } from "../shared/Button";
import styles from "./CanvasPanels.module.css";
import { WorkflowPicker, type WorkflowPickerProps } from "./WorkflowPicker";
import {
  CANVAS_PANEL_ATTRIBUTE,
  type CanvasPanelId,
  type CanvasPanels as PanelState,
} from "./useCanvasPanels";

export interface CanvasPanelsProps {
  readonly panels: PanelState;
  /** The diagram's text version, in the "As text" panel; none without components. */
  readonly text: ReactNode;
  /** The workflow picker's project, selection, and what it selects and clears. */
  readonly picker: Omit<WorkflowPickerProps, "onOpen">;
  /** The diagram's zoom actions, once it has loaded. */
  readonly zoom: ZoomActions | undefined;
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
 * One row at the canvas's bottom left: the workflow picker, "As text", and
 * zoom out, zoom in, and fit. "As text" opens its panel over the canvas,
 * above the row. The button shows whether its panel is open
 * (`aria-expanded`); Escape anywhere in the corner closes it and puts the
 * focus back on its button. A closed panel stays mounted, hidden, so its
 * scroll is still there when it opens. (The workflows and workloads lists
 * are on the tool rail.)
 */
export function CanvasPanels(props: CanvasPanelsProps) {
  const { panels, text } = props;
  const baseId = useId();
  const ids: PanelIds = (id) => `${baseId}-${id}`;
  const entries = panelEntries({ text });
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
  "panels" | "picker" | "zoom"
> {
  readonly entries: readonly PanelEntry[];
  readonly ids: PanelIds;
}

/** The row: the workflow picker, the panels' buttons, then zoom. */
function PanelButtons({
  entries,
  ids,
  panels,
  picker,
  zoom,
}: PanelButtonsProps) {
  return (
    <div className={styles.buttons}>
      <WorkflowPicker {...picker} onOpen={panels.close} />
      {entries.map((entry) => (
        <PanelButton key={entry.id} entry={entry} ids={ids} panels={panels} />
      ))}
      <ZoomButtons zoom={zoom} />
    </div>
  );
}

type PanelContents = Pick<CanvasPanelsProps, "text">;

/** The panels there are: "As text" only while it has a text version. */
function panelEntries({ text }: PanelContents): PanelEntry[] {
  const all: PanelEntry[] = [
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
 * Escape closes the text panel, if open, and focuses its button, the one
 * that controls it, and goes no further.
 */
function closeOnEscape({ event, panels, ids }: CloseOnEscapeInput): void {
  const { open } = panels;
  // The tool rail closes its own panels.
  if (event.key !== "Escape" || open !== "text") return;
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget.querySelector<HTMLElement>(
    `[aria-controls="${ids(open)}"]`,
  );
  panels.close();
  button?.focus();
}
