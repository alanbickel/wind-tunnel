import type { EdgeSettings } from "../../../domain/model/edge-settings";
import type {
  DefaultEvidence,
  EdgeEvidence,
  FieldDescriptor,
  FieldRange,
  SettingFieldDescriptor,
} from "../field-descriptor";

/** The settings an edge has; `id`, `from`, and `to` say what it joins. */
export type EdgeFieldKey = keyof EdgeSettings;

/** An edge's latency or timeout, in ms. */
export interface EdgeNumberFieldDescriptor extends FieldDescriptor {
  readonly key: "latencyMs" | "timeoutMs";
  readonly kind: "number";
  readonly range: FieldRange;
}

/** An edge's retry policy. */
export interface EdgeRetryFieldDescriptor extends FieldDescriptor {
  readonly key: "retry";
  readonly kind: "retry";
}

/**
 * An edge setting. Its default, and so its evidence, comes from the
 * caller's type (`edgeEvidence` in its `TypeFields`), so `withEvidence`
 * adds it per edge.
 */
export type EdgeFieldDescriptor =
  EdgeNumberFieldDescriptor | EdgeRetryFieldDescriptor;

/** Every edge's settings, in the order the Details tab lists them. */
export const EDGE_FIELDS: readonly EdgeFieldDescriptor[] = [
  {
    key: "latencyMs",
    label: "Latency",
    unit: "ms",
    kind: "number",
    range: { min: 0, minExclusive: false, max: undefined },
    help: "One-way network delay; each call pays it there and back. It never varies, where AWS's network has slow outliers (ENG-1).",
  },
  {
    key: "timeoutMs",
    label: "Timeout",
    unit: "ms",
    kind: "number",
    range: { min: 0, minExclusive: true, max: undefined },
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

/** An edge setting's descriptor with its caller type's evidence, for its field. */
export function withEvidence(
  field: EdgeFieldDescriptor,
  evidence: DefaultEvidence,
): SettingFieldDescriptor {
  return { ...field, evidence };
}

/**
 * The evidence for `AWS_EDGE_DEFAULTS`: each is an assumption, as
 * fidelity's defaults table says. A type with a default of its own
 * overrides its entry.
 */
export const ASSUMED_EDGE_EVIDENCE: EdgeEvidence = {
  latencyMs: { level: "assumption", fidelityId: "ENG-1" },
  timeoutMs: { level: "assumption", fidelityId: "ENG-5" },
  retry: { level: "assumption", fidelityId: "ENG-2" },
};
