import type { Distribution } from "../../domain/random/distribution";
import type { FieldRange } from "./field-descriptor";

/** A distribution's kind, e.g. `"lognormal"`. */
export type DistributionKind = Distribution["kind"];

/** One number of a distribution, as its own field reads it. Every part is in ms. */
export interface DistributionPart {
  /** The distribution's key, e.g. `"medianMs"`. */
  readonly key: string;
  /** Shown beside the field, e.g. "Median". */
  readonly label: string;
  /** How a message names it, e.g. "The median". */
  readonly subject: string;
  /** The values `distributionSchema` allows. */
  readonly range: FieldRange;
}

const AT_LEAST_ZERO: FieldRange = {
  min: 0,
  minExclusive: false,
  max: undefined,
};
const ABOVE_ZERO: FieldRange = { min: 0, minExclusive: true, max: undefined };

/** The kinds a distribution field's picker offers, in its order. */
export const DISTRIBUTION_KINDS: readonly DistributionKind[] = [
  "constant",
  "exponential",
  "lognormal",
];

/**
 * Each kind's numbers, in the order its fields show them. The first is the
 * kind's typical value, which a switch to another kind starts from.
 */
export const DISTRIBUTION_PARTS: Readonly<
  Record<DistributionKind, readonly DistributionPart[]>
> = {
  constant: [
    {
      key: "valueMs",
      label: "Value",
      subject: "The value",
      range: AT_LEAST_ZERO,
    },
  ],
  exponential: [
    { key: "meanMs", label: "Mean", subject: "The mean", range: ABOVE_ZERO },
  ],
  lognormal: [
    {
      key: "medianMs",
      label: "Median",
      subject: "The median",
      range: ABOVE_ZERO,
    },
    { key: "p99Ms", label: "p99", subject: "The p99", range: ABOVE_ZERO },
  ],
};
