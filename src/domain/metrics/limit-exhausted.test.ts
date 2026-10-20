import { describe, expect, it } from "vitest";
import { limitExhausted } from "./limit-exhausted";

describe("limitExhausted", () => {
  // Fails if a concurrency limit counts as exhausted with a slot still free,
  // or not once every slot is held.
  it("exhausts a concurrency limit once every slot is held", () => {
    const at = (peak: number) =>
      limitExhausted({ kind: "concurrency", limit: 10, peak });
    expect([at(9), at(10)]).toEqual([false, true]);
  });

  // Fails if a bucket counts as exhausted only when fully drawn down
  // (`peak >= limit`), since one with less than a token left throttles too.
  it("exhausts a bucket once less than one token is left", () => {
    const at = (peak: number) =>
      limitExhausted({ kind: "rate", limit: 2, peak });
    expect([at(0.9), at(1), at(1.1), at(2)]).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  // Fails if the bucket's rule drops the refill tolerance `tryTake` uses, so
  // a level it would still take a token from counts as exhausted.
  it("still has a token within the bucket's floating-point tolerance", () => {
    expect(limitExhausted({ kind: "rate", limit: 2, peak: 1 + 1e-12 })).toBe(
      false,
    );
  });
});
