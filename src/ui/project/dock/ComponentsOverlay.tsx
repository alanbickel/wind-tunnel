import { useMemo, type ReactNode } from "react";
import { callNumbersOf } from "../../../application/details/call-numbers";
import {
  isSelected,
  OUT_OF_DATE_NOTE,
  type DiagramContent,
  type DiagramItem,
  type DiagramMarks,
  type DiagramNode,
} from "../../diagram/diagram-model";
import { diagramOf } from "../diagram-of";
import { itemOf, selectionOf } from "../diagram-items";
import { useDisplayNames } from "../useDisplayNames";
import styles from "./ComponentsOverlay.module.css";
import type { OverlayProps } from "./overlay";

/**
 * The dock's Components tab, always there: the project's components, each
 * with its type and, after a run, its status, then its connections, with
 * their call numbers while a workflow is selected. It's the diagram's text
 * version, read from the same content and marks, so the two can't disagree.
 * Each row is a button that selects what it names, as a click on the
 * canvas does, and the focus stays on it. The list is the place the focus
 * goes after a component's or a connection's remove (`listRef`).
 */
export function ComponentsOverlay({
  listRef,
  record,
  projectRun,
  selecting,
}: OverlayProps) {
  return (
    <div
      ref={listRef}
      role="group"
      aria-label="Components and connections"
      tabIndex={-1}
    >
      <Lists record={record} projectRun={projectRun} selecting={selecting} />
    </div>
  );
}

type ListsProps = Pick<OverlayProps, "record" | "projectRun" | "selecting">;

/** The two lists, or the line that says there's nothing to list. */
function Lists({ record, projectRun, selecting }: ListsProps) {
  const displayNameOf = useDisplayNames();
  const { badges } = projectRun;
  const content = useMemo(
    () => diagramOf(record, { displayNameOf, badges }),
    [record, displayNameOf, badges],
  );
  const { selection, select } = selecting;
  if (content.nodes.length === 0) return <EmptyList />;
  const lists = {
    selected: selection && itemOf(selection),
    onSelect: (item: DiagramItem) => {
      select(selectionOf(item));
    },
  };
  const numbers = callNumbersOf(record.project, selection);
  return (
    <>
      <ItemList label="Components" entries={componentsOf(content)} {...lists} />
      <ItemList
        label="Connections"
        entries={connectionsOf({ content, numbers })}
        {...lists}
      />
    </>
  );
}

/** What the tab says while there are no components. */
function EmptyList() {
  return (
    <p className={styles.empty}>
      No components yet. Add one to start describing your system.
    </p>
  );
}

/** A diagram item, and how the list names it. */
interface ItemEntry {
  readonly item: DiagramItem;
  readonly text: string;
}

/** Each component's row, in project order. */
function componentsOf({ nodes }: DiagramContent): ItemEntry[] {
  return nodes.map((node) => ({
    item: { kind: "node", id: node.id },
    text: componentLine(node),
  }));
}

interface ConnectionsInput {
  readonly content: DiagramContent;
  readonly numbers: DiagramMarks["numbers"];
}

/** Each connection's row, "api → orders-db", in project order. */
function connectionsOf({ content, numbers }: ConnectionsInput): ItemEntry[] {
  const names = new Map(content.nodes.map((node) => [node.id, node.label]));
  const nameOf = (id: string) => names.get(id) ?? id;
  return content.edges.map(({ id, source, target }) => ({
    item: { kind: "edge", id },
    text: `${nameOf(source)} → ${nameOf(target)}${callsNote(numbers, id)}`,
  }));
}

/**
 * What a connection's row adds while a workflow's calls are numbered on the
 * canvas: " (call 2)", or " (calls 1, 4)" for an edge several calls follow,
 * the same numbers the arrow shows.
 */
function callsNote(numbers: DiagramMarks["numbers"], edgeId: string): string {
  const calls = numbers.find((n) => n.edgeId === edgeId)?.numbers;
  if (calls === undefined) return "";
  return ` (${calls.length === 1 ? "call" : "calls"} ${calls.join(", ")})`;
}

/**
 * A component's row: its name and type, then its status if it has one, and
 * when the status is from an earlier version of the project, that.
 */
function componentLine({ label, caption, status }: DiagramNode): string {
  const line = `${label} (${caption})`;
  if (status === undefined) return line;
  const note = status.outOfDate ? `, ${OUT_OF_DATE_NOTE}` : "";
  return `${line}: ${status.word}${note}`;
}

interface ItemListProps {
  /** Names the list for screen readers. */
  readonly label: string;
  readonly entries: readonly ItemEntry[];
  readonly selected: DiagramItem | undefined;
  readonly onSelect: (item: DiagramItem) => void;
}

/** One list, a button per item. */
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
 * One row, marked current while it's the selection. Not `aria-pressed`:
 * pressing it again selects it again, it doesn't switch it off, so it isn't
 * a toggle.
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
