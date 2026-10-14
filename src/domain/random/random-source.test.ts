import { describe, expect, it } from "vitest";
import { deriveSeed, SeededRandom } from "./random-source";

describe("deriveSeed", () => {
  it("is stable, and differs by seed and by stream", () => {
    expect(deriveSeed(42, "arrivals")).toBe(deriveSeed(42, "arrivals"));
    const seeds = new Set([
      deriveSeed(42, "arrivals"),
      deriveSeed(43, "arrivals"),
      deriveSeed(42, "retries"),
      deriveSeed(42, "component:a"),
      deriveSeed(42, "component:b"),
    ]);
    expect(seeds.size).toBe(5);
  });
});

const take = (random: SeededRandom, count: number) =>
  Array.from({ length: count }, () => random.next());

describe("SeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    expect(take(new SeededRandom(42), 5)).toEqual(
      take(new SeededRandom(42), 5),
    );
  });

  it("produces different sequences for different seeds", () => {
    expect(take(new SeededRandom(1), 5)).not.toEqual(
      take(new SeededRandom(2), 5),
    );
  });

  it("matches the reference mulberry32 output", () => {
    // Pinned so an accidental change to the algorithm (which would change
    // every saved run's results) fails loudly.
    expect(take(new SeededRandom(42), 3)).toMatchInlineSnapshot(`
      [
        0.6011037519201636,
        0.44829055899754167,
        0.8524657934904099,
      ]
    `);
  });

  it("returns numbers in [0, 1) with a roughly uniform spread", () => {
    const values = take(new SeededRandom(7), 10_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });
});
