import {
  AWS_SDK_STANDARD,
  type ResolvedRetryPolicy,
} from "../../../domain/engine/resolve-retry";
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

/** An edge's retries: the AWS SDK standard preset, or a custom policy. */
export interface EdgeRetryFieldDescriptor extends FieldDescriptor {
  readonly key: "retry";
  readonly kind: "retry";
  /** What the preset resolves to on the edge; see `RetryFieldDescriptor`. */
  readonly sdkStandard: ResolvedRetryPolicy;
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
    help: "Attempts in all, counting the first, and how the wait between them grows, up to 20 s. Throttles and transient errors are retried, timeouts and failures from further down included (ENG-8); an error retrying can't fix never is. A custom policy waits from one base delay after either. AWS SDK standard retries as the AWS SDKs do in standard mode: 3 attempts, or 4 into DynamoDB, with full jitter from 1,000 ms after a throttle and from 50 ms after a transient error, or 25 ms into DynamoDB, but without the SDKs' retry quota (ENG-2).",
    sdkStandard: AWS_SDK_STANDARD,
  },
];

/**
 * An edge setting's descriptor for an edge into a type whose SDK client
 * retries as `sdkStandard` says; only the retries' descriptor changes.
 */
export function intoTarget(
  field: EdgeFieldDescriptor,
  sdkStandard: ResolvedRetryPolicy,
): EdgeFieldDescriptor {
  if (field.kind !== "retry") return field;
  return { ...field, sdkStandard };
}

/** An edge setting's descriptor with its caller type's evidence, for its field. */
export function withEvidence(
  field: EdgeFieldDescriptor,
  evidence: DefaultEvidence,
): SettingFieldDescriptor {
  return { ...field, evidence };
}

/**
 * The evidence for `AWS_EDGE_DEFAULTS`: each is an assumption, as
 * fidelity's engine page says. A type with a default of its own
 * overrides its entry.
 */
export const ASSUMED_EDGE_EVIDENCE: EdgeEvidence = {
  latencyMs: { level: "assumption", fidelityId: "ENG-1" },
  timeoutMs: { level: "assumption", fidelityId: "ENG-5" },
  retry: { level: "assumption", fidelityId: "ENG-2" },
};
