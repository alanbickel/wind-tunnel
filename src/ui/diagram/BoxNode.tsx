import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";

/** What a box carries: its card, which `toFlowNode` renders. */
interface BoxData extends Record<string, unknown> {
  readonly label: ReactNode;
}

/** A box as React Flow holds it. */
type BoxFlowNode = Node<BoxData>;

/** What a box's handles say they're for, while they can start or end an arrow. */
export const HANDLE_TOOLTIP = "Drag to another box to connect";

/**
 * A box: its card between a handle to end an arrow on and one to start
 * from, as React Flow's own default node draws them, with a tooltip on
 * each while the diagram can connect boxes, and none in a read-only one.
 * It's registered as the `default` node type, so React Flow's styles for
 * a default node still apply.
 */
export function BoxNode({
  data,
  isConnectable,
  targetPosition = Position.Left,
  sourcePosition = Position.Right,
}: NodeProps<BoxFlowNode>) {
  const title = isConnectable ? HANDLE_TOOLTIP : undefined;
  return (
    <>
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
        title={title}
      />
      {data.label}
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
        title={title}
      />
    </>
  );
}

/** The boxes are drawn by the box node; it replaces React Flow's default. */
export const NODE_TYPES = { default: BoxNode };
