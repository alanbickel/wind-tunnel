import { useCallback, useMemo, type ReactNode } from "react";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { Diagram } from "../diagram/Diagram";
import {
  isSelected,
  type DiagramContent,
  type DiagramItem,
  type DiagramItemKind,
} from "../diagram/diagram-model";
import { Panel } from "../shared/Panel";
import { dispatchKind } from "../shared/kind-dispatch";
import { AddComponent, type AddComponentProps } from "./AddComponent";
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
}

/**
 * "Add component", then the project's components and connections as a
 * diagram, with the same facts as a list for anyone who can't see the
 * canvas. Either selects a component or a connection: a click on the
 * diagram, or a button in the list, which is the way every user can rely
 * on. A drag from one box to another on the diagram connects them;
 * "Connect to…" in a component's Details is the keyboard's way. A box
 * moves by dragging it, or with the arrow keys once it has the focus; its
 * place is only visual, so the text version doesn't change. With no
 * components, a line under "Add component" says what to do instead (UX
 * design §2.1 step 1).
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
    </Panel>
  );
}

interface DrawingProps extends ArchitectureViewProps {
  readonly content: DiagramContent;
}

/** The diagram, and its text version, of a project with components. */
function Drawing(props: DrawingProps) {
  const { record, content, onConnect, onMove } = props;
  const { selected, onItem } = useDiagramSelection(props);
  return (
    <>
      <Diagram
        content={content}
        label={`Architecture diagram of ${record.project.name}`}
        selected={selected}
        onSelect={onItem}
        onConnect={({ source, target }) => {
          onConnect(source, target);
        }}
        onMove={({ id, position }) => {
          onMove(id, position);
        }}
      />
      <TextVersion content={content} selected={selected} onSelect={onItem} />
    </>
  );
}

/** The screen's selection as the diagram's item, and what an item selects. */
interface DiagramSelection {
  readonly selected: DiagramItem | undefined;
  /** Selects the item's component or connection, or clears for none. */
  readonly onItem: (item: DiagramItem | undefined) => void;
}

/** The screen's selection in the diagram's terms, both ways. */
function useDiagramSelection({
  selection,
  onSelect,
  onClear,
}: ArchitectureViewProps): DiagramSelection {
  const selected = selection && dispatchKind(DIAGRAM_ITEMS, selection);
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
  return { selected, onItem };
}

/** The diagram's item for each kind of selection it can show. */
const DIAGRAM_ITEMS: KindHandlers<Selection, DiagramItem> = {
  component: ({ componentId }) => ({ kind: "node", id: componentId }),
  edge: ({ edgeId }) => ({ kind: "edge", id: edgeId }),
};

/** The selection each kind of diagram item stands for. */
const SELECTIONS: Readonly<Record<DiagramItemKind, (id: string) => Selection>> =
  {
    node: (componentId) => ({ kind: "component", componentId }),
    edge: (edgeId) => ({ kind: "edge", edgeId }),
  };

interface TextVersionProps {
  readonly content: DiagramContent;
  readonly selected: DiagramItem | undefined;
  readonly onSelect: (item: DiagramItem) => void;
}

/** The diagram's boxes and arrows as two lists of buttons, behind a disclosure. */
function TextVersion({ content, selected, onSelect }: TextVersionProps) {
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
      <summary>Components and connections as text</summary>
      <ItemList label="Components" entries={components} {...lists} />
      <ItemList label="Connections" entries={connections} {...lists} />
    </details>
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
