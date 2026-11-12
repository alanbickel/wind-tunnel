import {
  Background,
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
  type AriaLabelConfig,
  type Node,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, type KeyboardEvent } from "react";
import {
  canConnect,
  NO_MARKS,
  type DiagramConnection,
  type DiagramContent,
  type DiagramItem,
  type DiagramMarks,
  type DiagramMove,
  type DiagramNode,
} from "./diagram-model";
import { fitOptions, OPENING_FIT } from "./fit-options";
import { nodeIdOf } from "./node-id-of";
import { toFlowEdge, toFlowNode } from "./to-react-flow";
import { useMeasuredSizes, type MeasuredSizes } from "./useMeasuredSizes";
import {
  useNodeMoves,
  type HeldPositions,
  type NodeMoves,
} from "./useNodeMoves";

/**
 * React Flow still points each box and arrow at a description, which by
 * default offers select, move, and delete. Say what's true instead: a
 * sentence for each thing the canvas lets a box do, in this order.
 */
const TEXT_VERSION = "The text version after the diagram lists the same items.";
const READ_ONLY = "Read-only.";
const SELECT_SENTENCE = "Press Enter to show its details.";
const MOVE_SENTENCE = "Press the arrow keys, or drag it, to move it.";
const CONNECT_SENTENCE =
  "Drag from its right edge to another box to connect them.";

/** The canvas's dots, larger than React Flow's default of 1, so they show. */
const GRID_DOT_SIZE = 2;

interface FitViewOnResizeProps {
  readonly coveredRightPx: number;
}

/**
 * Fits the diagram to its box again whenever the box changes size, or
 * what covers its right edge does. React Flow's `fitView` fits only once,
 * when the diagram opens, but the box grows and shrinks with the window,
 * and an inspector over it opens and closes. Render it inside `<ReactFlow>`.
 */
function FitViewOnResize({ coveredRightPx }: FitViewOnResizeProps) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  useEffect(() => {
    void fitView(fitOptions({ width, coveredRightPx }));
  }, [fitView, width, height, coveredRightPx]);

  return null;
}

export interface DiagramCanvasProps {
  readonly content: DiagramContent;
  readonly marks?: DiagramMarks | undefined;
  readonly onSelect?: ((item: DiagramItem | undefined) => void) | undefined;
  readonly onConnect?: ((connection: DiagramConnection) => void) | undefined;
  readonly onMove?: ((move: DiagramMove) => void) | undefined;
  readonly coveredRightPx?: number | undefined;
}

/**
 * The boxes and arrows, drawn by React Flow. Only `Diagram` renders it, and
 * loads it lazily, so React Flow stays out of the app's first chunk.
 */
export function DiagramCanvas({
  content,
  marks = NO_MARKS,
  onSelect,
  onConnect,
  onMove,
  coveredRightPx = 0,
}: DiagramCanvasProps) {
  const items = useFlowItems({ content, marks, onMove });
  return (
    <ReactFlow
      nodes={items.nodes}
      edges={items.edges}
      // React Flow's own selection stays off: the diagram shows the
      // selection it's given, and reports clicks through onSelect.
      elementsSelectable={false}
      // Arrows never take a tab stop; the text version is the keyboard's
      // way to select them.
      edgesFocusable={false}
      {...selectionProps(onSelect)}
      {...connectionProps({ edges: content.edges, onConnect })}
      {...items.nodeProps}
      ariaLabelConfig={descriptionsOf({ onSelect, onConnect, onMove })}
      fitView
      fitViewOptions={OPENING_FIT}
    >
      <Background size={GRID_DOT_SIZE} />
      {/* At the left edge's middle: the screen puts its own controls at the
          canvas's top and bottom left. */}
      <Controls showInteractive={false} position="center-left" />
      <FitViewOnResize coveredRightPx={coveredRightPx} />
    </ReactFlow>
  );
}

/** What the canvas draws: its content and its marks, and what a move is reported to. */
interface FlowItemsInput {
  readonly content: DiagramContent;
  readonly marks: DiagramMarks;
  readonly onMove: DiagramCanvasProps["onMove"];
}

/**
 * The boxes and arrows as React Flow takes them, and the props that take
 * React Flow's changes to the boxes and move them.
 */
interface FlowItems {
  readonly nodes: NonNullable<ReactFlowProps["nodes"]>;
  readonly edges: NonNullable<ReactFlowProps["edges"]>;
  readonly nodeProps: NodeMoves["props"];
}

/**
 * The boxes and arrows as React Flow takes them, marking the selection and
 * the path, drawing each box being moved where it was put, and giving each
 * box the size React Flow measured, so it stays shown when its node is new.
 */
function useFlowItems({ content, marks, onMove }: FlowItemsInput): FlowItems {
  const { positions, props } = useNodeMoves({ nodes: content.nodes, onMove });
  const { sizes, remember } = useMeasuredSizes();
  const nodes = useMemo(
    () =>
      content.nodes.map((node) =>
        sized(toFlowNode(placed(node, positions), marks), sizes),
      ),
    [content.nodes, marks, positions, sizes],
  );
  const edges = useMemo(
    () => content.edges.map((edge) => toFlowEdge(edge, marks)),
    [content.edges, marks],
  );
  const onNodesChange: NodeMoves["props"]["onNodesChange"] = (changes) => {
    remember(changes);
    props.onNodesChange?.(changes);
  };
  return { nodes, edges, nodeProps: { ...props, onNodesChange } };
}

/** The React Flow node, with the size React Flow measured it at, if it has. */
function sized(node: Node, sizes: MeasuredSizes): Node {
  const measured = sizes.get(node.id);
  return measured === undefined ? node : { ...node, measured };
}

/** The node, at its held position if it's being moved. */
function placed(node: DiagramNode, positions: HeldPositions): DiagramNode {
  const position = positions.get(node.id);
  return position === undefined ? node : { ...node, position };
}

/** What the canvas reports to, which decides what a box can do. */
type Abilities = Pick<DiagramCanvasProps, "onSelect" | "onConnect" | "onMove">;

/**
 * The descriptions React Flow points each box and arrow at. React Flow
 * shows `keyboardDisabled` while the keyboard is enabled, and `default`
 * while it isn't, so both say the same.
 */
function descriptionsOf(abilities: Abilities): Partial<AriaLabelConfig> {
  const node = nodeDescription(abilities);
  return {
    "node.a11yDescription.default": node,
    "node.a11yDescription.keyboardDisabled": node,
    "edge.a11yDescription.default": `${READ_ONLY} ${TEXT_VERSION}`,
  };
}

/** A sentence for each thing a box can do, or "Read-only.", then the text version. */
function nodeDescription({ onSelect, onConnect, onMove }: Abilities): string {
  const sentences = [
    onSelect && SELECT_SENTENCE,
    onMove && MOVE_SENTENCE,
    onConnect && CONNECT_SENTENCE,
  ].filter((sentence) => sentence !== undefined);
  if (sentences.length === 0) sentences.push(READ_ONLY);
  return [...sentences, TEXT_VERSION].join(" ");
}

/** The props that select, if `onSelect` is given, or keep the canvas read-only. */
type SelectionProps = Pick<
  ReactFlowProps,
  "nodesFocusable" | "onNodeClick" | "onEdgeClick" | "onPaneClick" | "onKeyDown"
>;

function selectionProps(
  onSelect: DiagramCanvasProps["onSelect"],
): SelectionProps {
  if (onSelect === undefined) {
    // Otherwise each box is a tab stop whose description offers select,
    // move, and delete, none of which a read-only view supports.
    return { nodesFocusable: false };
  }
  return {
    // A box takes a tab stop, so Enter can select it, and the arrow keys
    // move it if the canvas moves boxes.
    nodesFocusable: true,
    onNodeClick: (_event, node) => {
      onSelect({ kind: "node", id: node.id });
    },
    onEdgeClick: (_event, edge) => {
      onSelect({ kind: "edge", id: edge.id });
    },
    onPaneClick: () => {
      onSelect(undefined);
    },
    onKeyDown: (event) => {
      selectNodeByKey(event, onSelect);
    },
  };
}

/** The arrows already drawn, and what a new one is reported to. */
interface ConnectionInput {
  readonly edges: DiagramContent["edges"];
  readonly onConnect: DiagramCanvasProps["onConnect"];
}

/** The props that let a drag between boxes draw an arrow, if `onConnect` is given. */
type ConnectionProps = Pick<
  ReactFlowProps,
  "nodesConnectable" | "onConnect" | "isValidConnection"
>;

function connectionProps({
  edges,
  onConnect,
}: ConnectionInput): ConnectionProps {
  if (onConnect === undefined) return { nodesConnectable: false };
  return {
    nodesConnectable: true,
    // Refuses a loop or a second arrow the same way before it's dropped,
    // so React Flow never draws one.
    isValidConnection: ({ source, target }) =>
      canConnect(edges, { source, target }),
    onConnect: ({ source, target }) => {
      onConnect({ source, target });
    },
  };
}

/** Selects the focused box when Enter is pressed on it; other keys pass. */
function selectNodeByKey(
  event: KeyboardEvent,
  onSelect: (item: DiagramItem) => void,
): void {
  if (event.key !== "Enter") return;
  const id = nodeIdOf(event.target);
  if (id === undefined) return;
  onSelect({ kind: "node", id });
}
