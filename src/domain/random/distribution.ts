import { z } from "zod";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type { RandomSource } from "./random-source";

/**
 * A probability distribution for a duration in milliseconds, written as plain
 * data so it can live in a component's config and in the project document.
 *
 * - `constant`: always `valueMs`.
 * - `exponential`: average `meanMs`. Memoryless; most samples are short, a few
 *   are long. Also used for the gaps between Poisson arrivals.
 * - `lognormal`: described by its median and 99th percentile, which are easier
 *   to reason about than the underlying mu and sigma. Good for service times:
 *   always positive, with a long right tail.
 */
export const distributionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("constant"),
    valueMs: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("exponential"),
    meanMs: z.number().positive(),
  }),
  z
    .object({
      kind: z.literal("lognormal"),
      medianMs: z.number().positive(),
      p99Ms: z.number().positive(),
    })
    .refine((d) => d.p99Ms >= d.medianMs, {
      message: "p99Ms must be at least medianMs",
      path: ["p99Ms"],
    }),
]);

export type Distribution = z.infer<typeof distributionSchema>;

/** The z-score of the 99th percentile of a standard normal distribution. */
const Z_99 = 2.3263478740408408;

/** Draws one value from a distribution, using `random`. */
type Sampler = (random: RandomSource) => number;

const SAMPLERS: KindHandlers<Distribution, Sampler> = {
  constant:
    ({ valueMs }) =>
    () =>
      valueMs,
  exponential:
    ({ meanMs }) =>
    (random) =>
      -meanMs * Math.log(uniformOpenAtZero(random)),
  lognormal: ({ medianMs, p99Ms }) => {
    const mu = Math.log(medianMs);
    const sigma = Math.log(p99Ms / medianMs) / Z_99;
    return (random) => Math.exp(mu + sigma * standardNormal(random));
  },
};

/** Draws one sample from `distribution`. */
export function sample(
  distribution: Distribution,
  random: RandomSource,
): number {
  return handleKind(SAMPLERS, distribution)(random);
}

/** A uniform number in (0, 1], safe to pass to `Math.log`. */
function uniformOpenAtZero(random: RandomSource): number {
  return 1 - random.next();
}

/** Box-Muller transform: two uniforms in, one standard normal out. */
function standardNormal(random: RandomSource): number {
  const u1 = uniformOpenAtZero(random);
  const u2 = random.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
