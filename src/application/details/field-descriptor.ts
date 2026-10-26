// What the Details tab says about each setting (UX design §5). A component
// type's settings are validated by its config schema in `domain/`; these
// descriptors say what each one means to a user, in AWS terms.

/**
 * How a setting's value is read and, later, edited: a number, a whole
 * number, a duration distribution (`Distribution`), or an edge's retry
 * policy.
 */
export type FieldKind = "number" | "whole-number" | "distribution" | "retry";

/**
 * How sure a default is, as fidelity's defaults table rates it: stated by
 * AWS, measured by others, or our own belief.
 */
export type EvidenceLevel = "documented" | "observed" | "assumption";

/** Where a default comes from (fidelity.md, "Default values and their evidence"). */
export interface DefaultEvidence {
  readonly level: EvidenceLevel;
  /**
   * The fidelity entry that explains the default or would tighten it, e.g.
   * `"RDS-2"`; undefined where the defaults table cites none.
   */
  readonly fidelityId: string | undefined;
}

/** One setting, as a user reads it. */
export interface FieldDescriptor {
  /** The setting's key, e.g. `"queryWorkers"`. */
  readonly key: string;
  /** Shown to users, e.g. "Query workers". */
  readonly label: string;
  /** What the number counts, e.g. "ms" or "requests/s"; undefined for a retry policy. */
  readonly unit: string | undefined;
  readonly kind: FieldKind;
  /**
   * What the setting does, and how a real AWS setting maps to it, or that
   * none does. Every AWS claim cites its fidelity entry in parentheses,
   * e.g. "(RDS-2)".
   */
  readonly help: string;
}

/** A component setting: a descriptor, and the evidence for its default. */
export interface ConfigFieldDescriptor extends FieldDescriptor {
  readonly evidence: DefaultEvidence;
}

/**
 * One component type's settings, in the order the Details tab lists them.
 * There's one for every key of the type's `defaultConfig`.
 */
export interface TypeFields {
  /** The component definition's type, e.g. `"rds"`. */
  readonly type: string;
  readonly fields: readonly ConfigFieldDescriptor[];
}

/** Every type's settings, keyed by type. */
export type FieldCatalog = ReadonlyMap<string, TypeFields>;
