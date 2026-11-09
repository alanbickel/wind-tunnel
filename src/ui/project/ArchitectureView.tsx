import { useCallback, useMemo, type ReactNode } from "react";
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
import { workflowPathText } from "../../application/details/workflow-path-text";
import type { Project } from "../../domain/model/project";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { Diagram } from "../diagram/Diagram";
import {
  isSelected,
  type DiagramContent,
  type DiagramItem,
  type DiagramItemKind,
  type DiagramMarks,
} from "../diagram/diagram-model";
import { Panel } from "../shared/Panel";
import { dispatchKind } from "../shared/kind-dispatch";
import { AddComponent, type AddComponentProps } from "./AddComponent";
import { WorkflowList, type AddWorkflowProps } from "./WorkflowList";
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
  /** "Add component", above the diagram. */
  readonly adding: AddComponentProps;
  /** "Add workflow", in the workflows list. */
  readonly addingWorkflow: AddWorkflowProps;
}

/**
 * "Add component", then the project's components and connections as a
 * diagram, with the same facts as lists for anyone who can't see the
 * canvas. Either selects a component or a connection: a click on the
 * diagram, or a button in the list, which is the way every user can rely
 * on. The text version also gives a line for each workflow's path. The
 * diagram marks the selection, and a selected workflow's path, or a
 * selected step's and its workflow's. A drag from one box to another on
 * the diagram connects them;
 * "Connect to…" in a component's Details is the keyboard's way. A box
 * moves by dragging it, or with the arrow keys once it has the focus; its
 * place is only visual, so the text version doesn't change. With no
 * components, a line under "Add component" says what to do instead (UX
 * design §2.1 step 1). Under them all, the workflows, each a button that
 * selects it, and "Add workflow".
 */
export function ArchitectureView(props: ArchitectureViewProps) {
  const content = useMemo(() => diagramOf(props.record), [props.record]);
  return (
    <Panel heading="Architecture" scrolls>
      <AddComponent {...props.adding} />
      {content.nodes.length === 0 ? (
        <p>No components yet. Add one to start describing your system.</p>
      ) : (
        <Drawing {...props} content={content} />
      )}
      <WorkflowList
        project={props.record.project}
        selection={props.selection}
        onSelect={props.onSelect}
        adding={props.addingWorkflow}
      />
    </Panel>
  );
}

interface DrawingProps extends ArchitectureViewProps {
  readonly content: DiagramContent;
}

/** The diagram, and its text version, of a project with components. */
function Drawing(props: DrawingProps) {
  const { record, content, onConnect, onMove } = props;
  const { marks, selected, onItem } = useDiagramSelection(props);
  return (
    <>
      <Diagram
        content={content}
        label={`Architecture diagram of ${record.project.name}`}
        marks={marks}
        onSelect={onItem}
        onConnect={({ source, target }) => {
          onConnect(source, target);
        }}
        onMove={({ id, position }) => {
          onMove(id, position);
        }}
      />
      <TextVersion
        content={content}
        paths={pathsOf(record.project)}
        selected={selected}
        onSelect={onItem}
      />
    </>
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
    () => marksOf(selectionOnArchitecture(project, selection)),
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

/** A selection's ringed parts and path as the diagram's marks. */
function marksOf({ ringed, path }: SelectionOnArchitecture): DiagramMarks {
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
  "new-workflow": () => undefined,
};

/** The selection each kind of diagram item stands for. */
const SELECTIONS: Readonly<Record<DiagramItemKind, (id: string) => Selection>> =
  {
    node: (componentId) => ({ kind: "component", componentId }),
    edge: (edgeId) => ({ kind: "edge", edgeId }),
  };

interface TextVersionProps {
  readonly content: DiagramContent;
  readonly paths: readonly PathLine[];
  readonly selected: DiagramItem | undefined;
  readonly onSelect: (item: DiagramItem) => void;
}

/**
 * The diagram's boxes and arrows as two lists of buttons, then the path
 * each workflow takes along them, one line each, behind a disclosure.
 */
function TextVersion({ content, paths, selected, onSelect }: TextVersionProps) {
  const names = new Map(content.nodes.map((node) => [node.id, node.label]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const components = content.nodes.map(({ id, label, caption }) => ({
    item: { kind: "node", id } as const,
    text: `${label} (${caption})`,
  }));
  const connections = content.edges.map(({ id, source, target }) => ({
    item: { kind: "edge", id } as const,
    text: `${nameOf(source)} → ${nameOf(target)}`,
  }));
  const lists = { selected, onSelect };
  return (
    <details className={styles.text}>
      <summary>Components, connections, and paths as text</summary>
      <ItemList label="Components" entries={components} {...lists} />
      <ItemList label="Connections" entries={connections} {...lists} />
      {paths.length > 0 && <PathList paths={paths} />}
    </details>
  );
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
