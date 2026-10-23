import type { Message } from "./message";
import type { Statement } from "./phrase";

/**
 * One thing a run did that the developer should know about: what, where,
 * when, why, and what would fix it (findings.md §3.1).
 */
export interface Finding {
  /** Which finding this is, stable across re-runs of the same project. */
  readonly key: FindingKey;
  readonly severity: Severity;
  /**
   * The limits of `key.componentId` the finding is about, if any: the ones
   * that refused its failed requests, or the one a note reads. A note whose
   * `explains` names one of them shows beneath it.
   */
  readonly limitNames: readonly string[];
  /** When: from the start of its first second to the end of its last. */
  readonly window: TimeWindow;
  /**
   * When its cause held, if it began earlier than `window`: from where the
   * cause began to the end of `window`.
   */
  readonly causeWindow: TimeWindow | undefined;
  /** What happened, as one statement; a phrasebook words it. */
  readonly summary: Statement;
  /** Why, in causal order. */
  readonly reasons: readonly Statement[];
  /** The numbers the statements quote, each with where it came from. */
  readonly evidence: readonly Evidence[];
  readonly fixes: readonly Fix[];
  /** Anchor in `docs/learning/aws-did-you-know.md`. */
  readonly learnMore: string | undefined;
  /**
   * For a cause note, what it explains: `findRun` puts it beneath every
   * other finding that matches. Undefined for a finding that explains
   * nothing.
   */
  readonly explains: Explains | undefined;
  /**
   * The findings this one follows from, which show beneath it. `findRun`
   * fills it from the other findings' `explains`, so no detector needs to
   * know another exists.
   */
  readonly causedBy: readonly FindingKey[];
  /**
   * Requests or messages affected, for ordering. Reconciles with the
   * totals. Undefined when the metrics can't count it exactly, such as late
   * deliveries.
   */
  readonly affected: number | undefined;
}

/** A finding as a detector returns it, before `findRun` links its causes. */
export type DetectedFinding = Omit<Finding, "causedBy">;

/**
 * A finding's identity: what kind it is, where, and the typed values that
 * tell two findings of a kind apart at one component. Compared field by
 * field (`sameKey`), never joined into a string, so a consumer reads each
 * field rather than parsing one.
 */
export interface FindingKey {
  /** The ID of the detector that made it, e.g. `"waiting-holds-limit"`. */
  readonly kind: string;
  /** Where: the component to highlight. */
  readonly componentId: string;
  /** The rejection reason a failure cause is about, e.g. `"throttled"`. */
  readonly reason: string | undefined;
  /** The limit a note is about, e.g. `"queryWorkers"`. */
  readonly limitName: string | undefined;
}

/**
 * What a cause note explains: a component and, optionally, one of its
 * limits. Without a limit, it explains every finding at the component; a
 * timeout or a late delivery has no limit, because reasons belong to
 * components (ADR-0016).
 */
export interface Explains {
  readonly componentId: string;
  /** Matches only findings whose `limitNames` include it. */
  readonly limitName: string | undefined;
}

/**
 * - `failure`: requests failed;
 * - `warning`: nothing failed, but work finished later than the project's
 *   own timeout lets a synchronous caller wait, messages were still waiting
 *   when a finished run ended, or a queue's delivery failed in its last
 *   second;
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
