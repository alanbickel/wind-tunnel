import { describe, expect, it } from "vitest";
import { rateAt } from "../../domain/engine/arrivals";
import type { ProfilePoint } from "../../domain/model/project";
import { profileLine, type ProfileLine } from "./profile-line";

const lunch: ProfilePoint[] = [
  { atMs: 0, requestsPerSec: 200 },
  { atMs: 10_000, requestsPerSec: 200 },
  { atMs: 20_000, requestsPerSec: 2000 },
  { atMs: 40_000, requestsPerSec: 2000 },
  { atMs: 50_000, requestsPerSec: 200 },
];

/** The line's rate at a time, by walking its vertices. */
function lineAt(line: ProfileLine, timeSec: number): number | undefined {
  const all = [...line.within, ...line.beyond];
  const next = all.findIndex((p) => p.timeSec >= timeSec);
  const to = all[next];
  const from = all[next - 1];
  if (to === undefined) return undefined;
  if (from === undefined || to.timeSec === timeSec) return to.requestsPerSec;
  const share = (timeSec - from.timeSec) / (to.timeSec - from.timeSec);
  return (
    from.requestsPerSec + share * (to.requestsPerSec - from.requestsPerSec)
  );
}

describe("profileLine", () => {
  // Fails if the line reads differently from the engine's rateAt: before
  // the first point, at a point, between two, and after the last.
  it("matches rateAt at several times", () => {
    const profile: ProfilePoint[] = [
      { atMs: 5_000, requestsPerSec: 100 },
      { atMs: 25_000, requestsPerSec: 500 },
    ];
    const line = profileLine({ profile, durationMs: 60_000 });

    for (const timeSec of [0, 2, 5, 10, 15, 25, 40, 60]) {
      expect(lineAt(line, timeSec), `${String(timeSec)} s`).toBeCloseTo(
        rateAt(profile, timeSec * 1000),
        9,
      );
    }
  });

  // Fails if the line doesn't pass through each point at its time and rate,
  // so the chart and the table disagree.
  it("passes through each point of the table", () => {
    const line = profileLine({ profile: lunch, durationMs: 60_000 });

    for (const point of lunch) {
      expect(lineAt(line, point.atMs / 1000)).toBe(point.requestsPerSec);
    }
  });

  // Fails if the line runs past the duration, or doesn't reach it, or the
  // end isn't worded.
  it("stops at the duration and says where", () => {
    const line = profileLine({ profile: lunch, durationMs: 45_000 });

    expect(line.within.at(-1)).toEqual({ timeSec: 45, requestsPerSec: 1100 });
    expect(Math.max(...line.within.map((p) => p.timeSec))).toBe(45);
    expect(line.endSec).toBe(45);
    expect(line.endText).toBe("Run ends at 45 s");
  });

  // Fails if a point past the end is dropped, or isn't joined to the end of
  // the run, where its line leaves the solid one.
  it("keeps the points past the end, from the end on", () => {
    const line = profileLine({ profile: lunch, durationMs: 45_000 });

    expect(line.beyond).toEqual([
      { timeSec: 45, requestsPerSec: 1100 },
      { timeSec: 50, requestsPerSec: 200 },
    ]);
  });

  // Fails if a point at the end counts as past it, or the end is drawn twice.
  it("doesn't count a point at the end as past it", () => {
    const line = profileLine({ profile: lunch, durationMs: 50_000 });

    expect(line.beyond).toEqual([]);
    expect(line.within.filter((p) => p.timeSec === 50)).toHaveLength(1);
  });

  // Fails if a one-point profile isn't flat from the start to the end.
  it("is flat for one point", () => {
    const line = profileLine({
      profile: [{ atMs: 0, requestsPerSec: 100 }],
      durationMs: 60_000,
    });

    expect(line.within).toEqual([
      { timeSec: 0, requestsPerSec: 100 },
      { timeSec: 60, requestsPerSec: 100 },
    ]);
  });

  // Fails if a stored out-of-order profile, two points at one time, or an
  // empty profile throws or draws something.
  it("copes with a stored profile that's out of order, repeated, or empty", () => {
    const unordered = profileLine({
      profile: [
        { atMs: 30_000, requestsPerSec: 300 },
        { atMs: 0, requestsPerSec: 100 },
      ],
      durationMs: 60_000,
    });
    const repeated = profileLine({
      profile: [
        { atMs: 10_000, requestsPerSec: 1 },
        { atMs: 10_000, requestsPerSec: 2 },
      ],
      durationMs: 60_000,
    });
    const empty = profileLine({ profile: [], durationMs: 60_000 });

    expect(unordered.within.map((p) => p.timeSec)).toEqual([0, 30, 60]);
    expect(repeated.within.filter((p) => p.timeSec === 10)).toHaveLength(1);
    expect(empty.within).toEqual([]);
  });
});
