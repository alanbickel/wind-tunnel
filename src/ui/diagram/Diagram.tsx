import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { DiagramContent } from "./diagram-model";
import { toFlowEdge, toFlowNode } from "./to-react-flow";

export interface DiagramProps {
  readonly content: DiagramContent;
  /** Names the diagram for screen readers, e.g. "Architecture of Checkout". */
  readonly label: string;
}

/**
 * A read-only diagram of boxes and arrows (ADR-0010). The user can pan and
 * zoom, but not move, connect, or select anything.
 */
export function Diagram({ content, label }: DiagramProps) {
  const nodes = useMemo(() => content.nodes.map(toFlowNode), [content.nodes]);
  const edges = useMemo(() => content.edges.map(toFlowEdge), [content.edges]);

  return (
    <div role="group" aria-label={label} style={{ height: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
