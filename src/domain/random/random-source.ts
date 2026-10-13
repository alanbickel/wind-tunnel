/**
 * The only source of randomness in the domain layer. The engine never calls
 * `Math.random`; it receives a `RandomSource`, so a run is reproducible from
 * its seed and tests can pass in a scripted source (MVP design §4.2).
 */
export interface RandomSource {
  /** Returns a uniformly distributed number in [0, 1). */
  next(): number;
}

/**
 * Seeded generator using mulberry32: a tiny, fast 32-bit PRNG. It is not
 * cryptographically secure, which is fine for simulation. The same seed always
 * produces the same sequence, on every JavaScript engine.
 */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
