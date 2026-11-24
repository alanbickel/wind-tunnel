import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/seeded-random";
import { checkComponentContract } from "../check-component-contract";
import { limitValues } from "../testing/limit-values";
import { s3Definition, type S3Config } from "./s3";

const build = (config: Partial<S3Config> = {}) =>
  s3Definition.build<string>(
    {
      readsPerSec: 3,
      writesPerSec: 2,
      readLatency: { kind: "constant", valueMs: 20 },
      writeLatency: { kind: "constant", valueMs: 30 },
      ...config,
    },
    { random: new SeededRandom(1) },
  );

/** Each arrival's effect kind, for `count` reads arriving at `nowMs`. */
function readsAt(
  s3: ReturnType<typeof build>,
  { count, nowMs }: { count: number; nowMs: number },
): string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      s3.arrive({
        request: `r${String(nowMs)}-${String(i)}`,
        action: "read",
        settings: {},
        nowMs,
      })[0]?.kind ?? "none",
  );
}

describe("s3Definition", () => {
  // Fails if the definition breaks the contract at its defaults: say, its
  // rejectionReasons stops listing slow-down.
  it("passes the component contract", () => {
    expect(checkComponentContract(s3Definition).violations).toEqual([]);
  });

  // Fails if a refusal over the rate breaks the contract: say, it rejects
  // with a reason other than the one its limits declare.
  it("passes the component contract while slowing requests down", () => {
    const report = checkComponentContract(s3Definition, {
      config: {
        ...s3Definition.defaultConfig,
        readsPerSec: 50,
        writesPerSec: 50,
      },
    });
    expect(report.violations).toEqual([]);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  // Fails if reads and writes share a bucket or a latency, or a request
  // over the rate is served or refused with another reason.
  it("refuses reads and writes over their own rates with slow-down", () => {
    const s3 = build({ readsPerSec: 1, writesPerSec: 1 });
    expect(
      s3.arrive({ request: "r1", action: "read", settings: {}, nowMs: 0 }),
    ).toEqual([{ kind: "started", request: "r1", serviceMs: 20 }]);
    expect(
      s3.arrive({ request: "r2", action: "read", settings: {}, nowMs: 0 }),
    ).toEqual([{ kind: "rejected", request: "r2", reason: "slow-down" }]);
    expect(
      s3.arrive({ request: "w1", action: "write", settings: {}, nowMs: 0 }),
    ).toEqual([{ kind: "started", request: "w1", serviceMs: 30 }]);
    expect(s3.inProgress).toBe(2);
  });

  // Fails if the bucket holds other than one second of requests (S3-3):
  // say, a burst of two seconds lets 6 of the first 7 reads through, or a
  // bucket that starts empty lets none.
  it("lets one second of requests through at once, then refills at the rate", () => {
    const s3 = build();
    expect(readsAt(s3, { count: 4, nowMs: 0 })).toEqual([
      "started",
      "started",
      "started",
      "rejected",
    ]);
    expect(readsAt(s3, { count: 2, nowMs: 1_000 / 3 })).toEqual([
      "started",
      "rejected",
    ]);
  });

  // Fails if the bucket's floor of one request goes: at 0.5 reads a second,
  // a bucket of half a token would refuse every read.
  it("lets a read through at a rate under one a second", () => {
    const s3 = build({ readsPerSec: 0.5 });
    expect(readsAt(s3, { count: 2, nowMs: 0 })).toEqual([
      "started",
      "rejected",
    ]);
    expect(readsAt(s3, { count: 1, nowMs: 2_000 })).toEqual(["started"]);
  });

  // Fails if S3 stops reporting either rate, counts a refused request as a
  // token taken or doesn't count it as refused, drains the wrong bucket, or
  // declares a reason other than the one it refuses with.
  it("reports each rate, the requests taken, and the tokens left", () => {
    const s3 = build();
    readsAt(s3, { count: 4, nowMs: 0 });
    expect(limitValues(s3)).toEqual([
      {
        kind: "rate",
        name: "readRate",
        whenFull: { kind: "refuse", reason: "slow-down" },
        ratePerSec: 3,
        burst: 3,
        taken: 3,
        refused: 1,
        tokensLeft: 0,
      },
      {
        kind: "rate",
        name: "writeRate",
        whenFull: { kind: "refuse", reason: "slow-down" },
        ratePerSec: 2,
        burst: 2,
        taken: 0,
        refused: 0,
        tokensLeft: 2,
      },
    ]);
  });
});
