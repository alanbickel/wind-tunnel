import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Selection } from "../../application/details/selection";
import {
  selectionOnArchitecture,
  type ArchitectureParts,
  type SelectionOnArchitecture,
} from "../../application/details/selection-on-architecture";
import { callNumbersOf } from "../../application/details/call-numbers";
import { workflowPathText } from "../../application/details/workflow-path-text";
import type { Project } from "../../domain/model/project";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { useUseCases } from "../app/useUseCases";
import type { RunBadges } from "../run/run-badges";
import { Diagram } from "../diagram/Diagram";
import {
  isSelected,
  OUT_OF_DATE_NOTE,
  type DiagramContent,
  type DiagramItem,
  type DiagramItemKind,
  type DiagramMarks,
  type DiagramNode,
} from "../diagram/diagram-model";
import type { ZoomActions } from "../diagram/zoom-actions";
import { dispatchKind } from "../shared/kind-dispatch";
import { CanvasPanels, type CanvasPanelsProps } from "./CanvasPanels";
import { ToolRail, type AddComponentProps } from "./ToolRail";
import type { CanvasPanels as CanvasPanelState } from "./useCanvasPanels";
import { WorkflowList, type AddWorkflowProps } from "./WorkflowList";
import { WorkloadList, type AddWorkloadProps } from "./WorkloadList";
import styles from "./ArchitectureView.module.css";
import { diagramOf } from "./diagram-of";

export interface ArchitectureViewProps {
  readonly record: ProjectRecord;
  readonly selection: Selection | undefined;
  readonly onSelect: (selection: Selection) => void;
  /** Called when the user clicks the diagram's empty space. */
  readonly onClear: () => void;
  /** Connects two components, as drawn on the diagram: caller, then callee. */
  readonly onConnect: (from: string, to: string) => void;
  /** Moves a component to where it was put on the diagram. */
  readonly onMove: (componentId: string, position: Point) => void;
  /** "Add component", on the tool rail. */
  readonly adding: AddComponentProps;
  /** "Add workflow", in the workflows list. */
  readonly addingWorkflow: AddWorkflowProps;
  /** "Add workload", in the workloads list. */
  readonly addingWorkload: AddWorkloadProps;
  /**
   * What a workflow's or a workload's remove announces: "Removed Get
   * order." Said on the tool rail, not in the list, whose panel may be hidden.
   */
  readonly workflowAnnouncement: string;
  /** Which panel is open: one of the tool rail's, or "As text". */
  readonly panels: CanvasPanelState;
  /**
   * The run on screen's status badges, drawn on the boxes and listed in
   * the text version; none before the first run.
   */
  readonly badges?: RunBadges | undefined;
  /** How much of the canvas's right edge the inspector covers, in pixels. */
  readonly coveredRightPx?: number;
}

/**
 * The canvas: the project's components and connections as a diagram that
 * fills the room it's given, with a tool rail down its left edge (Add
 * component, Connect, Workflows, Workloads), and at its bottom left "As
 * text", the workflow picker, and zoom, in one row; "As text" opens a panel
 * over the canvas. The text version has the same facts
 * as lists, for anyone who can't see the canvas, and a line for each
 * workflow's path. Either
 * selects a component or a connection: a click on the diagram, or a button
 * in the list, which is the way every user can rely on. The diagram marks
 * the selection, and a selected workflow's path, or a selected step's and
 * its workflow's. A drag from one box to another on the diagram connects
 * them; "Connect to…" in a component's Details is the keyboard's way. A
 * box moves by dragging it, or with the arrow keys once it has the focus;
 * its place is only visual, so the text version doesn't change. With no
 * components, a line on the canvas says what to do instead (UX design
 * §2.1 step 1), and there's no text version. "Workflows" lists them, each
 * a button that selects it, and "Add workflow"; "Workloads" does the same
 * for workloads. The rail comes first in the tab order, as "Add component"
 * did above the diagram.
 */
export function ArchitectureView(props: ArchitectureViewProps) {
  const displayNameOf = useDisplayNames();
  const { record, badges } = props;
  const content = useMemo(
    () => diagramOf(record, { displayNameOf, badges }),
    [record, displayNameOf, badges],
  );
  const headingId = useId();
  const selecting = useDiagramSelection(props);
  const empty = content.nodes.length === 0;
  const [zoom, setZoom] = useState<ZoomActions>();
  const drawn = { ...props, content, selecting, onZoom: setZoom };
  return (
    <section aria-labelledby={headingId} className={styles.canvas}>
      <h3 id={headingId} className={styles.heading}>
        Architecture
      </h3>
      <Rail {...props} />
      {empty ? <EmptyCanvas /> : <Drawing {...drawn} />}
      <CanvasPanels
        panels={props.panels}
        text={empty ? undefined : <TextVersion {...drawn} />}
        picker={pickerOf(props)}
        zoom={empty ? undefined : zoom}
      />
    </section>
  );
}

/** What the workflow picker shows and reports. */
function pickerOf(props: ArchitectureViewProps): CanvasPanelsProps["picker"] {
  const { record, selection, onSelect, onClear } = props;
  return { project: record.project, selection, onSelect, onClear };
}

/** A component type's name in words, from the types "Add component" offers. */
function useDisplayNames(): (type: string) => string {
  const { listComponentTypes } = useUseCases();
  return useMemo(() => {
    const names = new Map(
      listComponentTypes.execute().map((t) => [t.type, t.displayName]),
    );
    return (type) => names.get(type) ?? type;
  }, [listComponentTypes]);
}

/** What the canvas says while there are no components to draw. */
function EmptyCanvas() {
  return (
    <p className={styles.empty}>
      No components yet. Add one to start describing your system.
    </p>
  );
}

/** The tool rail, with the two lists it opens. */
function Rail(props: ArchitectureViewProps) {
  return (
    <ToolRail
      panels={props.panels}
      adding={props.adding}
      workflows={<Workflows {...props} />}
      workloads={<Workloads {...props} />}
      workflowAnnouncement={props.workflowAnnouncement}
    />
  );
}

/** The workflows list, for the "Workflows" panel. */
function Workflows(props: ArchitectureViewProps) {
  const { selection, onSelect } = props;
  return (
    <WorkflowList
      project={props.record.project}
      selection={selection}
      onSelect={onSelect}
      adding={props.addingWorkflow}
    />
  );
}

/** The workloads list, for the "Workloads" panel. */
function Workloads(props: ArchitectureViewProps) {
  const { selection, onSelect } = props;
  return (
    <WorkloadList
      project={props.record.project}
      selection={selection}
      onSelect={onSelect}
      adding={props.addingWorkload}
    />
  );
}

/** What the diagram and its text version draw, and their shared selection. */
interface DrawingProps extends ArchitectureViewProps {
  readonly content: DiagramContent;
  readonly selecting: DiagramSelection;
  /** Called with the diagram's zoom actions once it has loaded. */
  readonly onZoom: (zoom: ZoomActions | undefined) => void;
}

/** The diagram of a project with components. */
function Drawing(props: DrawingProps) {
  const { record, content, onConnect, onMove, selecting } = props;
  return (
    <Diagram
      content={content}
      label={`Architecture diagram of ${record.project.name}`}
      marks={selecting.marks}
      onSelect={selecting.onItem}
      onConnect={({ source, target }) => {
        onConnect(source, target);
      }}
      onMove={({ id, position }) => {
        onMove(id, position);
      }}
      coveredRightPx={props.coveredRightPx}
      onZoom={props.onZoom}
    />
  );
}

/** A workflow's path line in the text version. */
interface PathLine {
  readonly workflowId: string;
  readonly text: string;
}

/** Each workflow's path line, in project order. */
function pathsOf(project: Project): PathLine[] {
  return project.workflows.map((workflow) => ({
    workflowId: workflow.id,
    text: workflowPathText(project, workflow),
  }));
}

/** The screen's selection in the diagram's terms, and what an item selects. */
interface DiagramSelection {
  /** What the diagram marks: the selection, and a workflow's path. */
  readonly marks: DiagramMarks;
  /** The text version's selected item: a component or a connection. */
  readonly selected: DiagramItem | undefined;
  /** Selects the item's component or connection, or clears for none. */
  readonly onItem: (item: DiagramItem | undefined) => void;
}

/** The screen's selection in the diagram's terms, both ways. */
function useDiagramSelection({
  record,
  selection,
  onSelect,
  onClear,
}: ArchitectureViewProps): DiagramSelection {
  const { project } = record;
  const marks = useMemo(
    () => ({
      ...marksOf(selectionOnArchitecture(project, selection)),
      numbers: callNumbersOf(project, selection),
    }),
    [project, selection],
  );
  const selected = selection && dispatchKind(TEXT_ITEMS, selection);
  const onItem = useCallback(
    (item: DiagramItem | undefined) => {
      if (item === undefined) {
        onClear();
        return;
      }
      onSelect(SELECTIONS[item.kind](item.id));
    },
    [onSelect, onClear],
  );
  return { marks, selected, onItem };
}

/** A selection's ringed parts and path as the diagram's marks, before its numbers. */
function marksOf({
  ringed,
  path,
}: SelectionOnArchitecture): Omit<DiagramMarks, "numbers"> {
  return { selected: itemsOf(ringed), path: itemsOf(path) };
}

/** Components as nodes, and edges as edges. */
function itemsOf({ componentIds, edgeIds }: ArchitectureParts): DiagramItem[] {
  return [
    ...componentIds.map((id) => ({ kind: "node", id }) as const),
    ...edgeIds.map((id) => ({ kind: "edge", id }) as const),
  ];
}

/**
 * The text version's item for each kind of selection, or undefined for a
 * workflow or a step: their paths are lines of text, not items to select.
 */
const TEXT_ITEMS: KindHandlers<Selection, DiagramItem | undefined> = {
  component: ({ componentId }) => ({ kind: "node", id: componentId }),
  edge: ({ edgeId }) => ({ kind: "edge", id: edgeId }),
  workflow: () => undefined,
  step: () => undefined,
  workload: () => undefined,
  "new-workflow": () => undefined,
  // The finding's component is the text version's marked row.
  finding: ({ key }) => ({ kind: "node", id: key.componentId }),
};

/** The selection each kind of diagram item stands for. */
const SELECTIONS: Readonly<Record<DiagramItemKind, (id: string) => Selection>> =
  {
    node: (componentId) => ({ kind: "component", componentId }),
    edge: (edgeId) => ({ kind: "edge", edgeId }),
  };

/**
 * The diagram's boxes and arrows as two lists of buttons, then the path
 * each workflow takes along them, one line each.
 */
function TextVersion({ record, content, selecting }: DrawingProps) {
  const names = new Map(content.nodes.map((node) => [node.id, node.label]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const components = content.nodes.map((node) => ({
    item: { kind: "node", id: node.id } as const,
    text: componentLine(node),
  }));
  const connections = content.edges.map(({ id, source, target }) => ({
    item: { kind: "edge", id } as const,
    text: `${nameOf(source)} → ${nameOf(target)}${callsNote(selecting.marks, id)}`,
  }));
  const lists = { selected: selecting.selected, onSelect: selecting.onItem };
  const paths = pathsOf(record.project);
  return (
    <>
      <ItemList label="Components" entries={components} {...lists} />
      <ItemList label="Connections" entries={connections} {...lists} />
      {paths.length > 0 && <PathList paths={paths} />}
    </>
  );
}

/**
 * What a connection's line adds while a workflow's calls are numbered on the
 * canvas: " (call 2)", or " (calls 1, 4)" for an edge several calls follow,
 * the same numbers the arrow shows.
 */
function callsNote({ numbers }: DiagramMarks, edgeId: string): string {
  const calls = numbers.find((n) => n.edgeId === edgeId)?.numbers;
  if (calls === undefined) return "";
  return ` (${calls.length === 1 ? "call" : "calls"} ${calls.join(", ")})`;
}

/**
 * A component's line in the text version: its name and type, then its
 * status if it has one, and when the status is from an earlier version of
 * the project, that.
 */
function componentLine({ label, caption, status }: DiagramNode): string {
  const line = `${label} (${caption})`;
  if (status === undefined) return line;
  const note = status.outOfDate ? `, ${OUT_OF_DATE_NOTE}` : "";
  return `${line}: ${status.word}${note}`;
}

interface PathListProps {
  readonly paths: readonly PathLine[];
}

/**
 * Each workflow's path as a line of text. Not buttons: the Workflows list
 * under the text version selects a workflow.
 */
function PathList({ paths }: PathListProps) {
  return (
    <ul aria-label="Workflow paths" className={styles.items}>
      {paths.map(({ workflowId, text }) => (
        <li key={workflowId} className={styles.path}>
          {text}
        </li>
      ))}
    </ul>
  );
}

/** A diagram item, and how the text version names it. */
interface ItemEntry {
  readonly item: DiagramItem;
  readonly text: string;
}

interface ItemListProps {
  /** Names the list for screen readers. */
  readonly label: string;
  readonly entries: readonly ItemEntry[];
  readonly selected: DiagramItem | undefined;
  readonly onSelect: (item: DiagramItem) => void;
}

/** One list of the text version, a button per item. */
function ItemList({ label, entries, selected, onSelect }: ItemListProps) {
  return (
    <ul aria-label={label} className={styles.items}>
      {entries.map(({ item, text }) => (
        <li key={item.id}>
          <ItemButton item={item} selected={selected} onSelect={onSelect}>
            {text}
          </ItemButton>
        </li>
      ))}
    </ul>
  );
}

interface ItemButtonProps {
  readonly item: DiagramItem;
  readonly selected: DiagramItem | undefined;
  readonly onSelect: (item: DiagramItem) => void;
  readonly children: ReactNode;
}

/**
 * One item of the text version, marked current while it's the selection.
 * Not `aria-pressed`: pressing it again selects it again, it doesn't
 * switch it off, so it isn't a toggle.
 */
function ItemButton({ item, selected, onSelect, children }: ItemButtonProps) {
  return (
    <button
      type="button"
      className={styles.item}
      aria-current={isSelected(selected, item) || undefined}
      onClick={() => {
        onSelect(item);
      }}
    >
      {children}
    </button>
  );
}
