import type { Edge } from "../../../domain/model/project";
import type { FieldDescriptor } from "../field-descriptor";

/** The settings an edge has; `id`, `from`, and `to` say what it joins. */
export type EdgeFieldKey = keyof Pick<
  Edge,
  "latencyMs" | "timeoutMs" | "retry"
>;

/** An edge setting. Edges have no defaults yet, so no evidence either. */
export interface EdgeFieldDescriptor extends FieldDescriptor {
  readonly key: EdgeFieldKey;
}

/** Every edge's settings, in the order the Details tab lists them. */
export const EDGE_FIELDS: readonly EdgeFieldDescriptor[] = [
  {
    key: "latencyMs",
    label: "Latency",
    unit: "ms",
    kind: "number",
    help: "One-way network delay; each call pays it there and back. It never varies, where AWS's network has slow outliers (ENG-1).",
  },
  {
    key: "timeoutMs",
    label: "Timeout",
    unit: "ms",
    kind: "number",
    help: "How long the caller waits for each attempt, from sending it. The call it gives up on keeps running, holding its resources (ENG-4). Components have no timeouts of their own, so set this to match yours: a REST API's integration timeout is 29,000 ms at most, unless a Regional or private API requests more (ENG-5).",
  },
  {
    key: "retry",
    label: "Retries",
    unit: undefined,
    kind: "retry",
    help: "Attempts in all, counting the first, and how the wait between them grows, up to 20 s. Every failure is retried, timeouts included (ENG-3). The AWS SDKs retry on their own, with their own policy and a retry quota that this doesn't model (ENG-2).",
  },
];
