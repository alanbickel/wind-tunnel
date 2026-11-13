import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { EdgeOffer } from "./diagram-model";
import { EdgeOfferControl } from "./EdgeOfferControl";
import styles from "./Diagram.module.css";

/** What an arrow with an offer carries: its offer. */
export interface OfferEdgeData extends Record<string, unknown> {
  readonly offer: EdgeOffer;
}

/** React Flow's name for the arrow that carries an offer. */
export const OFFER_EDGE_TYPE = "offer";

/**
 * How far above the arrow's middle its call numbers sit, in pixels, so the
 * "+" can have the middle: label and button never overlap.
 */
const NUMBERS_LIFT_PX = 24;

/**
 * An arrow drawn as React Flow's default one is, with its offer's button at
 * its middle and its call numbers lifted above it. The button sits in React
 * Flow's label layer, so it's an ordinary tab stop, and a click on it isn't
 * a click on the arrow.
 */
export function OfferEdge(props: EdgeProps<Edge<OfferEdgeData>>) {
  const { id, markerEnd, label, data } = props;
  const [path, labelX, labelY] = getBezierPath(props);
  const liftPx = label === undefined ? 0 : NUMBERS_LIFT_PX;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        label={label}
        labelX={labelX}
        labelY={labelY - liftPx}
      />
      {data && <OfferButton offer={data.offer} x={labelX} y={labelY} />}
    </>
  );
}

interface OfferButtonProps {
  readonly offer: EdgeOffer;
  /** The arrow's middle, in the canvas's own coordinates. */
  readonly x: number;
  readonly y: number;
}

/** The offer's control, in React Flow's label layer, centered on the arrow's middle. */
function OfferButton({ offer, x, y }: OfferButtonProps) {
  return (
    <EdgeLabelRenderer>
      <div
        className={`nodrag nopan ${styles.offer ?? ""}`}
        style={{
          transform: `translate(-50%, -50%) translate(${String(x)}px, ${String(y)}px)`,
        }}
        // A click here would otherwise reach the canvas's pane, which
        // clears the selection, and the offers with it.
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <EdgeOfferControl offer={offer} />
      </div>
    </EdgeLabelRenderer>
  );
}
