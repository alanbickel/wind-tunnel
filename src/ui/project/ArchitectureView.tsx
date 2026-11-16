import { useCallback, useId, useMemo, useState } from "react";
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
import type { RunBadges } from "../run/run-badges";
import { Diagram } from "../diagram/Diagram";
import type {
  DiagramContent,
  DiagramItem,
  DiagramMarks,
} from "../diagram/diagram-model";
import type { ZoomActions } from "../diagram/zoom-actions";
import { CanvasPanels, type CanvasPanelsProps } from "./CanvasPanels";
import { selectionOf } from "./diagram-items";
import { useDisplayNames } from "./useDisplayNames";
import { ToolRail } from "./ToolRail";
import type { CanvasPanels as CanvasPanelState } from "./useCanvasPanels";
import { WorkflowList, type AddWorkflowProps } from "./WorkflowList";
import { WorkloadList, type AddWorkloadProps } from "./WorkloadList";
import { useEdgeOffers, type OfferingProps } from "./useEdgeOffers";
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
  /** "Add workflow", in the workflows list. */
  readonly addingWorkflow: AddWorkflowProps;
  /** "Add workload", in the workloads list. */
  readonly addingWorkload: AddWorkloadProps;
  /**
   * What a workflow's or a workload's remove announces: "Removed Get
   * order." Said on the tool rail, not in the list, whose panel may be hidden.
   */
  readonly workflowAnnouncement: string;
  /** Which panel of the tool rail is open. */
  readonly panels: CanvasPanelState;
  /** The run on screen's status badges, drawn on the boxes; none before the first run. */
  readonly badges?: RunBadges | undefined;
  /**
   * What a "+" on an arrow saves through, selects with, and says: it adds a
   * call to the selected workflow along that arrow.
   */
  readonly offering: OfferingProps;
  /** How much of the canvas's right edge the inspector covers, in pixels. */
  readonly coveredRightPx?: number;
}

/**
 * The canvas: the project's components and connections as a diagram that
 * fills the room it's given, with a tool rail down its left edge (Connect,
 * Workflows, Workloads), and at its bottom left the
 * workflow picker and zoom, in one row. A click on the diagram selects a
 * component or a connection; the dock's Components tab has the same facts
 * as lists, which every user can rely on. The diagram marks
 * the selection, and a selected workflow's path, or a selected step's and
 * its workflow's. A drag from one box to another on the diagram connects
 * them; "Connect to…" in a component's Details is the keyboard's way. With a
 * workflow selected, each arrow leaving a box in its path has a "+" that adds
 * a call along it; the outline's "Add a call from …" is the keyboard's way. A
 * box moves by dragging it, or with the arrow keys once it has the focus;
 * its place is only visual, so the lists don't change. With no
 * components, a line on the canvas says what to do instead (UX design
 * §2.1 step 1). "Workflows" lists them, each
 * a button that selects it, and "Add workflow"; "Workloads" does the same
 * for workloads. The rail comes first in the tab order.
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

/** What the diagram draws, and its selection. */
interface DrawingProps extends ArchitectureViewProps {
  readonly content: DiagramContent;
  readonly selecting: DiagramSelection;
  /** Called with the diagram's zoom actions once it has loaded. */
  readonly onZoom: (zoom: ZoomActions | undefined) => void;
}

/** The diagram of a project with components. */
function Drawing(props: DrawingProps) {
  const { record, content, onConnect, onMove, selecting } = props;
  const offers = useEdgeOffers({
    project: record.project,
    selection: props.selection,
    ...props.offering,
  });
  return (
    <Diagram
      content={content}
      label={`Architecture diagram of ${record.project.name}`}
      marks={selecting.marks}
      offers={offers}
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

/** The screen's selection in the diagram's terms, and what an item selects. */
interface DiagramSelection {
  /** What the diagram marks: the selection, and a workflow's path. */
  readonly marks: DiagramMarks;
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
  const onItem = useCallback(
    (item: DiagramItem | undefined) => {
      if (item === undefined) {
        onClear();
        return;
      }
      onSelect(selectionOf(item));
    },
    [onSelect, onClear],
  );
  return { marks, onItem };
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
