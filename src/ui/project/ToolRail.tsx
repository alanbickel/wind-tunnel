import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "../shared/Button";
import {
  AddComponentIcon,
  ConnectIcon,
  WorkflowsIcon,
  WorkloadsIcon,
} from "../shared/RailIcons";
import { ComponentTypeList } from "./ComponentTypeList";
import styles from "./ToolRail.module.css";
import {
  CANVAS_PANEL_ATTRIBUTE,
  type CanvasPanelId,
  type CanvasPanels,
} from "./useCanvasPanels";

export interface AddComponentProps {
  /** Adds a component of the type, and saves it. */
  readonly onAdd: (type: string) => void;
  /** The "Add component" button, where the focus goes after a remove. */
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  /** What a remove, which sends the focus here, announces: "Removed Table." */
  readonly announcement: string;
}

export interface ToolRailProps {
  readonly panels: CanvasPanels;
  readonly adding: AddComponentProps;
  /** The workflows list, which "Workflows" opens. */
  readonly workflows: ReactNode;
  /** The workloads list, which "Workloads" opens. */
  readonly workloads: ReactNode;
  /** What a workflow's or a workload's remove announces: "Removed Get order." */
  readonly workflowAnnouncement: string;
}

/** The panels the rail opens: the first two are popovers, the others lists. */
type RailPanelId = Extract<
  CanvasPanelId,
  "add" | "connect" | "workflows" | "workloads"
>;

/** One rail button, and the panel it opens. */
interface RailEntry {
  readonly id: RailPanelId;
  /** The button's name, its tooltip, and its panel's name. */
  readonly name: string;
  readonly icon: ReactNode;
  readonly content: ReactNode;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
}

/** Each panel's element id, which its button controls. */
type PanelIds = (id: RailPanelId) => string;

const RAIL_PANELS: ReadonlySet<CanvasPanelId> = new Set<CanvasPanelId>([
  "add",
  "connect",
  "workflows",
  "workloads",
]);

/** The popovers, which close on a click outside; a list stays open. */
const POPOVERS: ReadonlySet<CanvasPanelId> = new Set<CanvasPanelId>([
  "add",
  "connect",
]);

/**
 * The tool rail down the canvas's left edge (UX design §2): Add component,
 * Connect, Workflows, and Workloads, as a toolbar of icon buttons. Each
 * opens its panel beside the rail, over the canvas, one at a time (the
 * canvas's panel state holds which). Escape closes the open one and puts the
 * focus back on its button. A click outside closes Add component's list and
 * Connect's hint; the two lists stay open while you pick through their
 * rows. A closed panel stays mounted, hidden, so its scroll is still there
 * when it opens. Two polite regions say what a remove took: they're on the
 * rail, which always shows, since a list may be closed.
 */
export function ToolRail(props: ToolRailProps) {
  const { panels, adding, workflowAnnouncement } = props;
  const baseId = useId();
  const ids: PanelIds = (id) => `${baseId}-${id}`;
  const railRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(railRef, panels);
  const entries = railEntries(props);
  return (
    <div
      ref={railRef}
      className={styles.rail}
      onKeyDown={(event) => {
        closeOnEscape({ event, panels, ids });
      }}
    >
      <RailButtons entries={entries} ids={ids} panels={panels} />
      {entries.map((entry) => (
        <RailPanel
          key={entry.id}
          entry={entry}
          elementId={ids(entry.id)}
          open={panels.open === entry.id}
        />
      ))}
      <Announcement text={adding.announcement} />
      <Announcement text={workflowAnnouncement} />
    </div>
  );
}

interface RailButtonsProps {
  readonly entries: readonly RailEntry[];
  readonly ids: PanelIds;
  readonly panels: CanvasPanels;
}

/** The toolbar: a button per entry. */
function RailButtons({ entries, ids, panels }: RailButtonsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
      className={styles.buttons}
      onKeyDown={moveBetweenButtons}
    >
      {entries.map((entry) => (
        <RailButton key={entry.id} entry={entry} ids={ids} panels={panels} />
      ))}
    </div>
  );
}

/** "Add component", and the types it lists: choosing one adds it. */
function addEntry({ panels, adding }: ToolRailProps): RailEntry {
  return {
    id: "add",
    name: "Add component",
    icon: <AddComponentIcon />,
    buttonRef: adding.buttonRef,
    content: (
      <ComponentTypeList
        onChoose={(type) => {
          panels.close();
          adding.buttonRef.current?.focus();
          adding.onAdd(type);
        }}
      />
    ),
  };
}

/** The rail's buttons, in order, each with what its panel holds. */
function railEntries(props: ToolRailProps): RailEntry[] {
  const { workflows, workloads } = props;
  return [
    addEntry(props),
    {
      id: "connect",
      name: "Connect",
      icon: <ConnectIcon />,
      content: <ConnectHint />,
    },
    {
      id: "workflows",
      name: "Workflows",
      icon: <WorkflowsIcon />,
      content: workflows,
    },
    {
      id: "workloads",
      name: "Workloads",
      icon: <WorkloadsIcon />,
      content: workloads,
    },
  ];
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

interface RailButtonProps {
  readonly entry: RailEntry;
  readonly ids: PanelIds;
  readonly panels: CanvasPanels;
}

/** The icon button that opens and closes one panel; its name is hidden text. */
function RailButton({ entry, ids, panels }: RailButtonProps) {
  const { id, name, icon, buttonRef } = entry;
  const open = panels.open === id;
  return (
    <Button
      ref={buttonRef}
      variant="icon"
      title={name}
      expanded={open}
      controls={open ? ids(id) : undefined}
      onClick={() => {
        panels.toggle(id);
      }}
    >
      {icon}
      <span className={styles.name}>{name}</span>
    </Button>
  );
}

interface RailPanelProps {
  readonly entry: RailEntry;
  readonly elementId: string;
  readonly open: boolean;
}

/**
 * One panel: a region that may scroll, and so takes a tab stop. It names
 * its panel in `CANVAS_PANEL_ATTRIBUTE`, so `reveal` can open it.
 */
function RailPanel({ entry, elementId, open }: RailPanelProps) {
  return (
    <section
      id={elementId}
      {...{ [CANVAS_PANEL_ATTRIBUTE]: entry.id }}
      aria-label={entry.name}
      hidden={!open}
      tabIndex={0}
      className={styles.panel}
    >
      {entry.content}
    </section>
  );
}

interface AnnouncementProps {
  readonly text: string;
}

/**
 * A polite region, on the page from the start, empty, so a screen reader
 * announces a message put in it.
 */
function Announcement({ text }: AnnouncementProps) {
  return (
    <p role="status" className={styles.announcement}>
      {text}
    </p>
  );
}

/** Closes an open popover when a press lands outside the rail. */
function useCloseOnOutsideClick(
  railRef: RefObject<HTMLElement | null>,
  panels: CanvasPanels,
): void {
  const { open, close } = panels;
  useEffect(() => {
    if (open === undefined || !POPOVERS.has(open)) return;
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
  readonly ids: PanelIds;
}

/**
 * Escape closes the open rail panel and focuses its button, the one that
 * controls it, and goes no further.
 */
function closeOnEscape({ event, panels, ids }: CloseOnEscapeInput): void {
  const { open } = panels;
  if (event.key !== "Escape" || open === undefined) return;
  if (!RAIL_PANELS.has(open)) return;
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget.querySelector<HTMLElement>(
    `[aria-controls="${ids(open as RailPanelId)}"]`,
  );
  panels.close();
  button?.focus();
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
