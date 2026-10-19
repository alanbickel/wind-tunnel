import {
  Background,
  Controls,
  ReactFlow,
  type AriaLabelConfig,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import styles from "./Diagram.module.css";
import type { DiagramContent } from "./diagram-model";
import { toFlowEdge, toFlowNode } from "./to-react-flow";

/**
 * React Flow still points each box and arrow at a description, which by
 * default offers select, move, and delete. Say what's true instead.
 */
const READ_ONLY_DESCRIPTION =
  "Read-only. The text version after the diagram lists the same items.";
const READ_ONLY_DESCRIPTIONS = {
  "node.a11yDescription.default": READ_ONLY_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": READ_ONLY_DESCRIPTION,
  "edge.a11yDescription.default": READ_ONLY_DESCRIPTION,
} satisfies Partial<AriaLabelConfig>;

export interface DiagramProps {
  readonly content: DiagramContent;
  /** Names the diagram for screen readers, e.g. "Architecture of Checkout". */
  readonly label: string;
}

/**
 * A read-only diagram of boxes and arrows (ADR-0010). The user can pan and
 * zoom, but not move, connect, select, or tab to anything. It isn't
 * readable by screen readers, so pair it with a text version.
 */
export function Diagram({ content, label }: DiagramProps) {
  const nodes = useMemo(() => content.nodes.map(toFlowNode), [content.nodes]);
  const edges = useMemo(() => content.edges.map(toFlowEdge), [content.edges]);

  return (
    <div
      role="group"
      aria-label={label}
      className={styles.diagram}
      style={{ height: 400 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        // Otherwise each box and arrow is a tab stop whose description offers
        // select, move, and delete, none of which a read-only view supports.
        nodesFocusable={false}
        edgesFocusable={false}
        ariaLabelConfig={READ_ONLY_DESCRIPTIONS}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
