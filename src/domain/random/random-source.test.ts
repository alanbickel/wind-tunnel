import { describe, expect, it } from "vitest";
import { deriveSeed } from "./random-source";

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
