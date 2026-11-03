import type {
  Dimensions,
  NodeChange,
  NodeDimensionChange,
} from "@xyflow/react";
import { useCallback, useState } from "react";

/** Each box's size as React Flow measured it, by the box's id. */
export type MeasuredSizes = ReadonlyMap<string, Dimensions>;

/** The sizes measured so far, and what takes React Flow's changes. */
export interface MeasuredSizesState {
  readonly sizes: MeasuredSizes;
  /** Keeps the sizes in React Flow's node changes; ignores the rest. */
  readonly remember: (changes: readonly NodeChange[]) => void;
}

const NO_SIZES: MeasuredSizes = new Map();

/**
 * The boxes' sizes, as React Flow reports them. React Flow takes a box's
 * size only from the node it's given: a new node without one, as the canvas
 * makes on every step of a drag, is hidden, with its arrows, until it's
 * measured again, so the boxes flash. Give each node its size back.
 */
export function useMeasuredSizes(): MeasuredSizesState {
  const [sizes, setSizes] = useState<MeasuredSizes>(NO_SIZES);
  const remember = useCallback((changes: readonly NodeChange[]) => {
    setSizes((current) => withMeasured(current, changes));
  }, []);
  return { sizes, remember };
}

/** The sizes with the changes' measurements in; the same map if there are none. */
function withMeasured(
  sizes: MeasuredSizes,
  changes: readonly NodeChange[],
): MeasuredSizes {
  const measured = changes.filter(isMeasurement);
  if (measured.length === 0) return sizes;
  const next = new Map(sizes);
  for (const { id, dimensions } of measured) next.set(id, dimensions);
  return next;
}

/** A change that measures a box, with the size it measured. */
type Measurement = NodeDimensionChange & { readonly dimensions: Dimensions };

function isMeasurement(change: NodeChange): change is Measurement {
  return change.type === "dimensions" && change.dimensions !== undefined;
}
