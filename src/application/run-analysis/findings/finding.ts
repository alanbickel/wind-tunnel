import type { Message } from "./message";

/**
 * One thing a run did that the developer should know about: what, where,
 * when, why, and what would fix it (findings.md §3.1).
 */
export interface Finding {
  /**
   * Stable across re-runs of the same project, e.g.
   * `"failed-requests:orders-db: too-many-connections"`.
   */
  readonly id: string;
  readonly detectorId: string;
  readonly severity: Severity;
  /** Where: the component to highlight. */
  readonly componentId: string;
  /** When: from the start of its first second to the end of its last. */
  readonly window: TimeWindow;
  /**
   * When its cause held, if it began earlier than `window`: from where the
   * cause began to the end of `window`.
   */
  readonly causeWindow: TimeWindow | undefined;
  /** What happened, in one sentence. */
  readonly summary: Message;
  /** Why, in causal order. */
  readonly reasons: readonly Message[];
  /** The numbers the sentences quote, each with where it came from. */
  readonly evidence: readonly Evidence[];
  readonly fixes: readonly Fix[];
  /** Anchor in `docs/learning/aws-did-you-know.md`. */
  readonly learnMore: string | undefined;
  /** Findings this one follows from, by ID. They show beneath it. */
  readonly causedBy: readonly string[];
  /**
   * Requests or messages affected, for ordering. Reconciles with the
   * totals. Undefined when the metrics can't count it exactly, such as late
   * deliveries.
   */
  readonly affected: number | undefined;
}

/**
 * - `failure`: requests failed;
 * - `warning`: nothing failed, but work finished later than the project's
 *   own timeout lets a synchronous caller wait;
 * - `note`: worth knowing, or the cause of another finding.
 *
 * Requests still in progress when a run ends are normal: they appear only
 * in the verdict's counts (findings.md §3.2).
 */
export type Severity = "failure" | "warning" | "note";

/** `[fromMs, toMs)` from the run's start, on whole snapshot boundaries. */
export interface TimeWindow {
  readonly fromMs: number;
  readonly toMs: number;
}

/** A number a finding quotes, and where it came from. */
export interface Evidence {
  /** What the number is, e.g. "orders-db: too-many-connections failures". */
  readonly what: string;
  readonly value: number;
  readonly source: EvidenceSource;
}

/**
 * - `totals`: a sum over every snapshot so far, which matches the
 *   collector's totals once the run finishes;
 * - `snapshots`: read from the per-second snapshots by a rule `what` gives;
 * - `config`: the project's settings.
 */
export type EvidenceSource = "totals" | "snapshots" | "config";

/** A change that would help, and how we know it would. */
export interface Fix {
  /** Whether the change is to the project, or to the real AWS system. */
  readonly scope: FixScope;
  readonly message: Message;
  /** A fix can't be built without its evidence (findings.md §3.1). */
  readonly claim: Claim;
  /**
   * Entries in `docs/design/fidelity.md` (e.g. `RDS-2`) where a known
   * difference from AWS could change the claim.
   */
  readonly fidelityIds: readonly string[];
}

export type FixScope = "wind-tunnel" | "aws";

/** The evidence levels of `docs/design/fidelity.md`. */
export type Claim = DocumentedClaim | ObservedClaim | AssumptionClaim;

/** Stated in AWS documentation. */
export interface DocumentedClaim {
  readonly kind: "documented";
  /** The page's title, as a link's text. */
  readonly title: string;
  readonly url: string;
}

/** Shown by a run: a test that turns red without it. */
export interface ObservedClaim {
  readonly kind: "observed";
  /** The test file, from the repository's root. */
  readonly file: string;
  /** The `it` that shows it, by its name. */
  readonly test: string;
}

/** Believed but not verified, and labeled as such. */
export interface AssumptionClaim {
  readonly kind: "assumption";
}
