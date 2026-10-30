import {
  Background,
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
  type AriaLabelConfig,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, type KeyboardEvent } from "react";
import {
  canConnect,
  type DiagramConnection,
  type DiagramContent,
  type DiagramItem,
} from "./diagram-model";
import { toFlowEdge, toFlowNode } from "./to-react-flow";

/**
 * React Flow still points each box and arrow at a description, which by
 * default offers select, move, and delete. Say what's true instead.
 */
const READ_ONLY_DESCRIPTION =
  "Read-only. The text version after the diagram lists the same items.";
const SELECTABLE_DESCRIPTION =
  "Press Enter to show its details. The text version after the diagram lists the same items.";
const CONNECTABLE_DESCRIPTION =
  "Press Enter to show its details, or drag from its right edge to another box to connect them. The text version after the diagram lists the same items.";
const READ_ONLY_DESCRIPTIONS = {
  "node.a11yDescription.default": READ_ONLY_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": READ_ONLY_DESCRIPTION,
  "edge.a11yDescription.default": READ_ONLY_DESCRIPTION,
} satisfies Partial<AriaLabelConfig>;
// React Flow shows `keyboardDisabled` while the keyboard is enabled, and
// `default` while it isn't, so both say what Enter does.
const SELECTABLE_DESCRIPTIONS = {
  ...READ_ONLY_DESCRIPTIONS,
  "node.a11yDescription.default": SELECTABLE_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": SELECTABLE_DESCRIPTION,
} satisfies Partial<AriaLabelConfig>;
const CONNECTABLE_DESCRIPTIONS = {
  ...SELECTABLE_DESCRIPTIONS,
  "node.a11yDescription.default": CONNECTABLE_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": CONNECTABLE_DESCRIPTION,
} satisfies Partial<AriaLabelConfig>;

/**
 * Fits the diagram to its box again whenever the box changes size. React
 * Flow's `fitView` fits only once, when the diagram opens, but in a
 * fixed-height column the box grows and shrinks with the window and with
 * what's open below it. Render it inside `<ReactFlow>`.
 */
function FitViewOnResize() {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  useEffect(() => {
    void fitView();
  }, [fitView, width, height]);

  return null;
}

export interface DiagramCanvasProps {
  readonly content: DiagramContent;
  readonly selected?: DiagramItem | undefined;
  readonly onSelect?: ((item: DiagramItem | undefined) => void) | undefined;
  readonly onConnect?: ((connection: DiagramConnection) => void) | undefined;
}

/**
 * The boxes and arrows, drawn by React Flow. Only `Diagram` renders it, and
 * loads it lazily, so React Flow stays out of the app's first chunk.
 */
export function DiagramCanvas({
  content,
  selected,
  onSelect,
  onConnect,
}: DiagramCanvasProps) {
  const nodes = useMemo(
    () => content.nodes.map((node) => toFlowNode(node, selected)),
    [content.nodes, selected],
  );
  const edges = useMemo(
    () => content.edges.map((edge) => toFlowEdge(edge, selected)),
    [content.edges, selected],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodesDraggable={false}
      // React Flow's own selection stays off: the diagram shows the
      // selection it's given, and reports clicks through onSelect.
      elementsSelectable={false}
      // Arrows never take a tab stop; the text version is the keyboard's
      // way to select them.
      edgesFocusable={false}
      {...selectionProps(onSelect)}
      {...connectionProps({ edges: content.edges, onConnect })}
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
      <FitViewOnResize />
    </ReactFlow>
  );
}

/** The props that select, if `onSelect` is given, or keep the canvas read-only. */
type SelectionProps = Pick<
  ReactFlowProps,
  | "nodesFocusable"
  | "ariaLabelConfig"
  | "onNodeClick"
  | "onEdgeClick"
  | "onPaneClick"
  | "onKeyDown"
>;

function selectionProps(
  onSelect: DiagramCanvasProps["onSelect"],
): SelectionProps {
  if (onSelect === undefined) {
    // Otherwise each box is a tab stop whose description offers select,
    // move, and delete, none of which a read-only view supports.
    return { nodesFocusable: false, ariaLabelConfig: READ_ONLY_DESCRIPTIONS };
  }
  return {
    // A box takes a tab stop, so Enter can select it.
    nodesFocusable: true,
    ariaLabelConfig: SELECTABLE_DESCRIPTIONS,
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
  "nodesConnectable" | "onConnect" | "isValidConnection" | "ariaLabelConfig"
>;

function connectionProps({
  edges,
  onConnect,
}: ConnectionInput): ConnectionProps {
  if (onConnect === undefined) return { nodesConnectable: false };
  return {
    nodesConnectable: true,
    ariaLabelConfig: CONNECTABLE_DESCRIPTIONS,
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
  if (event.key !== "Enter" || !(event.target instanceof Element)) return;
  const id = event.target.closest(".react-flow__node")?.getAttribute("data-id");
  if (id === null || id === undefined) return;
  onSelect({ kind: "node", id });
}
