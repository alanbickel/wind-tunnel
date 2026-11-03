import type { NodeChange, ReactFlowProps } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { DiagramMove, DiagramNode, DiagramPoint } from "./diagram-model";
import { nodeIdOf } from "./node-id-of";

/** How far one arrow key press moves a box, as React Flow's own does. */
const ARROW_STEP_PX = 5;
/** Shift and an arrow key moves a box this many steps. */
const SHIFT_STEPS = 4;
/** A run of arrow key presses reports its move once the keys stop this long. */
export const KEYBOARD_MOVE_PAUSE_MS = 500;

/** Which way each arrow key moves a box, in steps. */
const ARROW_DIRECTIONS: Readonly<Record<string, DiagramPoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** Where each box being moved is drawn, by its id. */
export type HeldPositions = ReadonlyMap<string, DiagramPoint>;

/** The props that let boxes move. */
type MoveProps = Pick<
  ReactFlowProps,
  | "nodesDraggable"
  | "nodesFocusable"
  | "onNodesChange"
  | "onNodeDragStart"
  | "onNodeDragStop"
  | "onKeyDownCapture"
  | "onBlur"
>;

/** Where the moved boxes are drawn, and the props that move them. */
export interface NodeMoves {
  readonly positions: HeldPositions;
  readonly props: MoveProps;
}

/** The boxes as given, and what each move is reported to. */
export interface NodeMovesInput {
  readonly nodes: readonly DiagramNode[];
  readonly onMove: ((move: DiagramMove) => void) | undefined;
}

const NO_POSITIONS: HeldPositions = new Map();

/**
 * Lets boxes move, if `onMove` is given. A box follows the pointer while
 * it's dragged, and the move is reported when the drag ends. A focused box
 * moves with the arrow keys, and a run of presses is reported once, when
 * the keys stop for `KEYBOARD_MOVE_PAUSE_MS`, the box loses the focus, or
 * a drag starts, so either is one save. The canvas draws each moved box
 * where it was put until it's given new nodes, which should then hold the
 * move.
 */
export function useNodeMoves({ nodes, onMove }: NodeMovesInput): NodeMoves {
  const { positions, place } = useHeldPositions(nodes);
  const positionOf = (id: string) =>
    positions.get(id) ?? nodes.find((node) => node.id === id)?.position;
  const keys = useKeyboardMoves({ positionOf, place, onMove });
  if (onMove === undefined) {
    return { positions, props: { nodesDraggable: false } };
  }
  return {
    positions,
    props: {
      nodesDraggable: true,
      // A box takes the focus, so the arrow keys can move it, even on a
      // canvas that doesn't select.
      nodesFocusable: true,
      onNodesChange: (changes) => {
        placeDragged(changes, place);
      },
      onNodeDragStop: (_event, node) => {
        onMove({ id: node.id, position: node.position });
      },
      ...keys,
    },
  };
}

/** A box's id, and where to draw it. */
type Place = (id: string, position: DiagramPoint) => void;

interface HeldPositionsState {
  readonly nodes: readonly DiagramNode[];
  readonly positions: HeldPositions;
}

interface HeldPositionsResult {
  readonly positions: HeldPositions;
  readonly place: Place;
}

/** The moved boxes' positions, forgotten when new nodes are given. */
function useHeldPositions(nodes: readonly DiagramNode[]): HeldPositionsResult {
  const [held, setHeld] = useState<HeldPositionsState>({
    nodes,
    positions: NO_POSITIONS,
  });
  // Starting again from new nodes, during render, as React's "adjusting
  // state when a prop changes" pattern does.
  if (held.nodes !== nodes) setHeld({ nodes, positions: NO_POSITIONS });
  const positions = held.nodes === nodes ? held.positions : NO_POSITIONS;
  const place = useCallback<Place>((id, position) => {
    setHeld(({ nodes: shown, positions: placed }) => ({
      nodes: shown,
      positions: new Map(placed).set(id, position),
    }));
  }, []);
  return { positions, place };
}

/**
 * Draws each box React Flow is dragging where the pointer has it. Only
 * changes made while dragging count: React Flow reports a drag's end as a
 * change too, but `onNodeDragStop` reports that.
 */
function placeDragged(changes: readonly NodeChange[], place: Place): void {
  for (const change of changes) {
    if (change.type === "position" && change.dragging && change.position) {
      place(change.id, change.position);
    }
  }
}

interface KeyboardMovesInput {
  readonly positionOf: (id: string) => DiagramPoint | undefined;
  readonly place: Place;
  readonly onMove: ((move: DiagramMove) => void) | undefined;
}

type KeyboardMoveProps = Pick<
  MoveProps,
  "onKeyDownCapture" | "onBlur" | "onNodeDragStart"
>;

/**
 * The arrow keys' moves, held until the keys pause, the box loses the
 * focus, or a drag starts.
 */
function useKeyboardMoves({
  positionOf,
  place,
  onMove,
}: KeyboardMovesInput): KeyboardMoveProps {
  const held = useHeldMove(onMove);
  // The box's position: the held move's, if the box has one, or as drawn.
  const heldOrShown = (id: string): DiagramPoint | undefined => {
    const move = held.current();
    return move?.id === id ? move.position : positionOf(id);
  };

  return {
    // In the capture phase, so the box's own handler never sees the key:
    // React Flow moves its selected box itself, and interrupts the screen
    // reader with a message giving the place the box left.
    onKeyDownCapture: (event) => {
      const move = keyboardMove(event, heldOrShown);
      if (move === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      place(move.id, move.position);
      held.hold(move);
    },
    onBlur: (event) => {
      if (nodeIdOf(event.target) === held.current()?.id) held.report();
    },
    // Pressing the mouse on the focused box doesn't blur it, so a held move
    // would be reported after the drag's, putting the box back. The drag
    // starts where the keys put the box, so reporting first loses nothing.
    onNodeDragStart: () => {
      held.report();
    },
  };
}

/** A move held until a pause, and how to report it sooner. */
interface HeldMove {
  /** The move held, if any. */
  readonly current: () => DiagramMove | undefined;
  /** Holds `move`, in place of any held, and reports it after a pause. */
  readonly hold: (move: DiagramMove) => void;
  /** Reports the held move now, if there is one. */
  readonly report: () => void;
}

/**
 * One move held for `onMove`, reported `KEYBOARD_MOVE_PAUSE_MS` after the
 * last `hold`, when `report` is called, or when the canvas goes, as when
 * the user leaves the project.
 */
function useHeldMove(onMove: NodeMovesInput["onMove"]): HeldMove {
  const pending = useRef<DiagramMove>(undefined);
  const timer = useRef<number>(undefined);
  // The latest `onMove`, so a held move is reported to it, and a new one
  // each render doesn't report the move early.
  const reportTo = useRef(onMove);
  useLayoutEffect(() => {
    reportTo.current = onMove;
  }, [onMove]);
  const report = useCallback(() => {
    window.clearTimeout(timer.current);
    const move = pending.current;
    pending.current = undefined;
    if (move !== undefined) reportTo.current?.(move);
  }, []);
  useEffect(() => report, [report]);
  const hold = useCallback(
    (move: DiagramMove) => {
      pending.current = move;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(report, KEYBOARD_MOVE_PAUSE_MS);
    },
    [report],
  );
  const current = useCallback(() => pending.current, []);
  return { current, hold, report };
}

/** Where an arrow key moves the box it's pressed on, or undefined for any other key. */
function keyboardMove(
  event: KeyboardEvent,
  positionOf: (id: string) => DiagramPoint | undefined,
): DiagramMove | undefined {
  const direction = ARROW_DIRECTIONS[event.key];
  const id = nodeIdOf(event.target);
  if (direction === undefined || id === undefined) return undefined;
  const from = positionOf(id);
  if (from === undefined) return undefined;
  const stepPx = ARROW_STEP_PX * (event.shiftKey ? SHIFT_STEPS : 1);
  return {
    id,
    position: {
      x: from.x + direction.x * stepPx,
      y: from.y + direction.y * stepPx,
    },
  };
}
