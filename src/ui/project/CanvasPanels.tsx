import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../shared/Button";
import styles from "./CanvasPanels.module.css";
import type {
  CanvasPanelId,
  CanvasPanels as PanelState,
} from "./useCanvasPanels";

export interface CanvasPanelsProps {
  readonly panels: PanelState;
  /** The workflows list, in the "Workflows" panel. */
  readonly workflows: ReactNode;
  /** The diagram's text version, in the "As text" panel; none without components. */
  readonly text: ReactNode;
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
 * mounted, hidden, so its live regions and its scroll are still there.
 */
export function CanvasPanels({ panels, workflows, text }: CanvasPanelsProps) {
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
          id={ids(id)}
          label={label}
          open={panels.open === id}
        >
          {content}
        </PanelBody>
      ))}
      <div className={styles.buttons}>
        {entries.map((entry) => (
          <PanelButton key={entry.id} entry={entry} ids={ids} panels={panels} />
        ))}
      </div>
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
  readonly id: string;
  /** Names the panel's region for screen readers. */
  readonly label: string;
  readonly open: boolean;
  readonly children: ReactNode;
}

/** One panel: a region that scrolls, and so takes a tab stop. */
function PanelBody({ id, label, open, children }: PanelBodyProps) {
  return (
    <section
      id={id}
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
