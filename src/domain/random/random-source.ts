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
 * A seed for one named stream of a run, e.g. `"arrivals"` or
 * `"component:orders-db"`. Each part of a simulation draws from its own
 * stream, so a change to one part (say, a component's config) doesn't shift
 * the random numbers every other part sees. That keeps runs comparable.
 *
 * FNV-1a over the seed's bytes, then the stream name.
 */
export function deriveSeed(seed: number, stream: string): number {
  let hash = 0x811c9dc5;
  const mix = (byte: number) => {
    hash = Math.imul(hash ^ byte, 0x01000193);
  };
  for (let shift = 0; shift < 32; shift += 8) mix((seed >>> shift) & 0xff);
  for (let i = 0; i < stream.length; i++) mix(stream.charCodeAt(i));
  return hash >>> 0;
}
