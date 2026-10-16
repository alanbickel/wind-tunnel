import { sample, type Distribution } from "../random/distribution";
import type { RandomSource } from "../random/random-source";
import type { ServiceTime } from "./service-time";

/**
 * How long one unit of work takes (MVP design §3.1), sampled from a
 * distribution each time so that requests don't all take exactly as long.
 */
export class SampledServiceTime implements ServiceTime {
  readonly distribution: Distribution;
  private readonly random: RandomSource;

  constructor(distribution: Distribution, random: RandomSource) {
    this.distribution = distribution;
    this.random = random;
  }

  /** Duration of the next unit of work, in milliseconds. Never negative. */
  next(): number {
    return Math.max(0, sample(this.distribution, this.random));
  }
}
