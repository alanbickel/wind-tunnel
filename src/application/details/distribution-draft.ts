import {
  distributionSchema,
  type Distribution,
} from "../../domain/random/distribution";
import { lookup } from "../../domain/shared/kind-handlers";
import { count } from "../run-analysis/number-format";
import {
  DISTRIBUTION_PARTS,
  type DistributionKind,
  type DistributionPart,
} from "./distribution-parts";
import { checkNumberDraft, numberDraft, type NumberRule } from "./number-draft";

/** What's typed into a distribution field: its kind, and each part's text. */
export interface DistributionDraft {
  readonly kind: DistributionKind;
  /** What's typed in each part's field, keyed by the part's key, e.g. `medianMs`. */
  readonly texts: Readonly<Record<string, string>>;
}

/** A distribution draft, once checked: the distribution, or what's wrong. */
export type DistributionCheck = DistributionPasses | DistributionFails;

export interface DistributionPasses {
  readonly status: "passes";
  readonly value: Distribution;
}

export interface DistributionFails {
  readonly status: "fails";
  /** A message for each part that fails, keyed by the part's key. */
  readonly messages: Readonly<Record<string, string>>;
}

/**
 * A stored distribution as its field shows it to edit. A value that isn't
 * a distribution, which a saved project can't hold, shows as an empty
 * constant.
 */
export function distributionDraft(value: unknown): DistributionDraft {
  const parsed = distributionSchema.safeParse(value);
  if (!parsed.success) return { kind: "constant", texts: { valueMs: "" } };
  const values: Readonly<Record<string, unknown>> = parsed.data;
  return {
    kind: parsed.data.kind,
    texts: textsOf(parsed.data.kind, (part) => numberDraft(values[part.key])),
  };
}

/**
 * The draft with another kind. A part the draft already has a text for,
 * from a kind it switched away from, keeps it, so switching back puts the
 * old values back. The rest are filled from the old kind's typical value:
 * a constant takes a lognormal's median, and a lognormal starts with its
 * median and p99 both at a constant's value. So a switch never leaves a
 * part empty.
 */
export function switchKind(
  draft: DistributionDraft,
  kind: DistributionKind,
): DistributionDraft {
  const typical = draft.texts[typicalPart(draft.kind).key] ?? "";
  const filled = textsOf(kind, (part) => draft.texts[part.key] ?? typical);
  return { kind, texts: { ...draft.texts, ...filled } };
}

/**
 * Checks each part against its range, then the rules between parts (a
 * lognormal's p99 is at least its median), then the schema, which stays
 * the authority.
 */
export function checkDistributionDraft(
  draft: DistributionDraft,
): DistributionCheck {
  const parts = lookup(DISTRIBUTION_PARTS, draft.kind);
  const checks = parts.map((part) => ({
    part,
    check: checkNumberDraft(draft.texts[part.key] ?? "", partRule(part)),
  }));
  const failed = checks.flatMap(({ part, check }) =>
    check.status === "fails" ? [[part.key, check.message] as const] : [],
  );
  if (failed.length > 0) return fails(Object.fromEntries(failed));
  const candidate: Record<string, unknown> = { kind: draft.kind };
  for (const { part, check } of checks) {
    if (check.status === "passes") candidate[part.key] = check.value;
  }
  return checkWhole(candidate);
}

/** The rules between parts, then the schema. */
function checkWhole(candidate: Record<string, unknown>): DistributionCheck {
  const between = p99BelowMedian(candidate);
  if (between !== undefined) return fails(between);
  const parsed = distributionSchema.safeParse(candidate);
  if (parsed.success) return { status: "passes", value: parsed.data };
  // Reached only if a part's range disagrees with the schema, which
  // field-ranges.test.ts ("each distribution part's range") rules out.
  return fails(
    Object.fromEntries(
      parsed.error.issues.map((issue) => [
        String(issue.path[0]),
        issue.message,
      ]),
    ),
  );
}

/** A lognormal's p99 below its median, worded on the p99. */
function p99BelowMedian(
  candidate: Record<string, unknown>,
): Record<string, string> | undefined {
  const { kind, medianMs, p99Ms } = candidate;
  if (kind !== "lognormal") return undefined;
  if (typeof medianMs !== "number" || typeof p99Ms !== "number")
    return undefined;
  if (p99Ms >= medianMs) return undefined;
  return {
    p99Ms: `The p99 must be at least the median (${count(medianMs)} ms).`,
  };
}

function fails(messages: Readonly<Record<string, string>>): DistributionFails {
  return { status: "fails", messages };
}

/** A part's rule: every part is a number in ms, not necessarily whole. */
function partRule({ subject, range }: DistributionPart): NumberRule {
  return { subject, wholeNumber: false, range };
}

/** The part a switch of kind starts from: the kind's first. */
function typicalPart(kind: DistributionKind): DistributionPart {
  const [first] = lookup(DISTRIBUTION_PARTS, kind);
  if (first === undefined) throw new Error(`No parts for "${kind}".`);
  return first;
}

function textsOf(
  kind: DistributionKind,
  textOf: (part: DistributionPart) => string,
): Record<string, string> {
  return Object.fromEntries(
    lookup(DISTRIBUTION_PARTS, kind).map((part) => [part.key, textOf(part)]),
  );
}
