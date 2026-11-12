import { describe, expect, it } from "vitest";
import type { ProfilePoint } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { inTimeOrder, nextPointAtMs, rowAfterMove } from "./profile-points";
import {
  addedPointName,
  movedMessage,
  rateChangeName,
  removedPointName,
  timeChangeName,
} from "./profile-step-names";
import {
  addProfilePoint,
  removeProfilePoint,
  setProfilePoint,
} from "./workload-edits";

/** Points as [seconds, requests/s] pairs. */
function points(...pairs: [number, number][]): ProfilePoint[] {
  return pairs.map(([sec, requestsPerSec]) => ({
    atMs: sec * 1000,
    requestsPerSec,
  }));
}

/** The sample with workload "steady" having this profile, and a second one, "other". */
function recordWith(profile: ProfilePoint[]): ProjectRecord {
  const [steady] = sampleRecord.project.workloads;
  if (steady === undefined) throw new Error("The sample has a workload");
  const other = { ...steady, id: "other", name: "Other" };
  return {
    ...sampleRecord,
    project: {
      ...sampleRecord.project,
      workloads: [{ ...steady, profile }, other],
    },
  };
}

function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

/** The profile of "steady", as [seconds, requests/s] pairs. */
function pairsOf(record: ProjectRecord): [number, number][] {
  const profile = record.project.workloads.find(
    (w) => w.id === "steady",
  )?.profile;
  return (profile ?? []).map((p) => [p.atMs / 1000, p.requestsPerSec]);
}

const lunch = points([0, 200], [10, 200], [20, 2000], [40, 2000], [50, 200]);

describe("addProfilePoint", () => {
  // Fails if the point isn't 10 s after the last one at the last one's
  // rate, or the command changes another workload or the input.
  it("adds a point 10 s after the last, at its rate, and nothing else", () => {
    const start = recordWith(points([0, 200]));
    const before = copyOf(start);

    const next = addProfilePoint(start, { workloadId: "steady" });

    expect(pairsOf(next)).toEqual([
      [0, 200],
      [10, 200],
    ]);
    expect(next.project.workloads[1]).toBe(start.project.workloads[1]);
    expect(start).toEqual(before);
  });

  // Fails if a point given a time in the middle lands anywhere but its
  // sorted place, or takes any rate but the one the line already has there.
  it("puts a point at a given time in its sorted place, on the line", () => {
    const start = recordWith(points([0, 100], [40, 300]));

    const next = addProfilePoint(start, { workloadId: "steady", atMs: 20_000 });

    expect(pairsOf(next)).toEqual([
      [0, 100],
      [20, 200],
      [40, 300],
    ]);
  });

  // Fails if a time another point has gets a second point, a missing
  // workload returns a new record, or an empty profile gets no first point.
  it("refuses a taken time and a missing workload; fills an empty profile", () => {
    const start = recordWith(points([0, 100], [10, 100]));

    expect(addProfilePoint(start, { workloadId: "steady", atMs: 10_000 })).toBe(
      start,
    );
    expect(addProfilePoint(start, { workloadId: "nope" })).toBe(start);
    const empty = addProfilePoint(recordWith([]), { workloadId: "steady" });
    expect(pairsOf(empty)).toEqual([[0, 100]]);
  });
});

describe("setProfilePoint", () => {
  // Fails if a rate change moves the point, touches another point, or
  // changes the input.
  it("sets a rate and leaves the rest", () => {
    const start = recordWith(lunch);
    const before = copyOf(start);

    const next = setProfilePoint(start, {
      workloadId: "steady",
      atMs: 50_000,
      change: { requestsPerSec: 300 },
    });

    expect(pairsOf(next)).toEqual([
      [0, 200],
      [10, 200],
      [20, 2000],
      [40, 2000],
      [50, 300],
    ]);
    expect(start).toEqual(before);
  });

  // Fails if a new time isn't sorted into place, or the point doesn't take
  // its rate with it.
  it("re-sorts a point whose time changed, keeping its rate", () => {
    const next = setProfilePoint(recordWith(lunch), {
      workloadId: "steady",
      atMs: 20_000,
      change: { atMs: 45_000 },
    });

    expect(pairsOf(next)).toEqual([
      [0, 200],
      [10, 200],
      [40, 2000],
      [45, 2000],
      [50, 200],
    ]);
  });

  // Fails if a time another point has is accepted, which would leave a line
  // with two rates at one moment.
  it("refuses a time another point has", () => {
    const start = recordWith(lunch);

    const next = setProfilePoint(start, {
      workloadId: "steady",
      atMs: 20_000,
      change: { atMs: 40_000 },
    });

    expect(next).toBe(start);
  });

  // Fails if a missing workload or point, or a change to the value the
  // point has, returns a new record.
  it("returns the record as it was for a missing target or no change", () => {
    const start = recordWith(lunch);
    const same = { workloadId: "steady", atMs: 20_000 };

    expect(
      setProfilePoint(start, {
        ...same,
        workloadId: "nope",
        change: { atMs: 1 },
      }),
    ).toBe(start);
    expect(
      setProfilePoint(start, { ...same, atMs: 21_000, change: { atMs: 1 } }),
    ).toBe(start);
    expect(setProfilePoint(start, { ...same, change: { atMs: 20_000 } })).toBe(
      start,
    );
    expect(
      setProfilePoint(start, { ...same, change: { requestsPerSec: 2000 } }),
    ).toBe(start);
  });

  // Fails if a stored profile with two points at one time can't be fixed
  // by changing the first's time: the screen can't address the second.
  it("fixes a stored duplicate time by changing the first point's time", () => {
    const stored = recordWith(points([0, 100], [10, 100], [10, 500]));

    const next = setProfilePoint(stored, {
      workloadId: "steady",
      atMs: 10_000,
      change: { atMs: 20_000 },
    });

    expect(pairsOf(next)).toEqual([
      [0, 100],
      [10, 500],
      [20, 100],
    ]);
  });

  // Fails if the first edit to a stored out-of-order profile doesn't sort
  // all of it.
  it("sorts a stored out-of-order profile on its first edit", () => {
    const stored = recordWith(points([30, 300], [0, 100], [10, 200]));

    const next = setProfilePoint(stored, {
      workloadId: "steady",
      atMs: 0,
      change: { requestsPerSec: 150 },
    });

    expect(pairsOf(next)).toEqual([
      [0, 150],
      [10, 200],
      [30, 300],
    ]);
  });
});

describe("removeProfilePoint", () => {
  // Fails if another point is removed or changed, or the input is changed.
  it("removes the point at a time, and nothing else", () => {
    const start = recordWith(lunch);
    const before = copyOf(start);

    const next = removeProfilePoint(start, {
      workloadId: "steady",
      atMs: 20_000,
    });

    expect(pairsOf(next)).toEqual([
      [0, 200],
      [10, 200],
      [40, 2000],
      [50, 200],
    ]);
    expect(start).toEqual(before);
  });

  // Fails if the only point can be removed, or a missing point or workload
  // returns a new record.
  it("refuses the only point, and a missing point or workload", () => {
    const only = recordWith(points([0, 100]));

    expect(removeProfilePoint(only, { workloadId: "steady", atMs: 0 })).toBe(
      only,
    );
    expect(
      removeProfilePoint(recordWith(lunch), { workloadId: "steady", atMs: 1 })
        .project,
    ).toEqual(recordWith(lunch).project);
    expect(removeProfilePoint(only, { workloadId: "nope", atMs: 0 })).toBe(
      only,
    );
  });

  // Fails if a stored duplicate time can't be removed from the screen: the
  // first of the two is the one the command takes.
  it("removes the first of a stored duplicate time", () => {
    const stored = recordWith(points([0, 100], [10, 100], [10, 500]));

    const next = removeProfilePoint(stored, {
      workloadId: "steady",
      atMs: 10_000,
    });

    expect(pairsOf(next)).toEqual([
      [0, 100],
      [10, 500],
    ]);
  });
});

describe("the profile's step names and messages", () => {
  const workloadName = "Lunch rush";

  // Fails if a step's name drifts from the words the design gives it.
  it("names each step as the design words it", () => {
    expect(addedPointName({ workloadName, atMs: 10_000 })).toBe(
      "Add a point at 10 s to Lunch rush's profile",
    );
    expect(
      rateChangeName({ workloadName, atMs: 50_000, requestsPerSec: 200 }),
    ).toBe("Change Lunch rush's rate at 50 s to 200 requests/s");
    expect(
      timeChangeName({ workloadName, atMs: 50_000, newAtMs: 55_000 }),
    ).toBe("Change Lunch rush's point at 50 s to 55 s");
    expect(removedPointName({ workloadName, atMs: 50_000 })).toBe(
      "Remove the point at 50 s from Lunch rush's profile",
    );
  });

  // Fails if the message is said when the row didn't change, or counts rows
  // from 0.
  it("says a move only when the row changed", () => {
    expect(movedMessage({ from: 2, to: 3, rowCount: 5 })).toBe(
      "Moved to row 4 of 5.",
    );
    expect(movedMessage({ from: 2, to: 2, rowCount: 5 })).toBeUndefined();
  });
});

describe("the helpers the screen and the commands share", () => {
  // Fails if 45 over the 20 s row doesn't land in row 3 (counting from 0),
  // or a time between its neighbors changes its row.
  it("finds the row a point lands in", () => {
    const timesMs = [0, 10_000, 20_000, 40_000, 50_000];

    expect(rowAfterMove({ timesMs, index: 2, atMs: 45_000 })).toBe(3);
    expect(rowAfterMove({ timesMs, index: 2, atMs: 25_000 })).toBe(2);
    expect(rowAfterMove({ timesMs, index: 2, atMs: 0.5 })).toBe(1);
  });

  // Fails if the next time isn't 10 s after the latest, or an empty profile
  // doesn't start at 0.
  it("puts the next point 10 s after the latest time", () => {
    expect(nextPointAtMs([0, 30_000, 10_000])).toBe(40_000);
    expect(nextPointAtMs([])).toBe(0);
  });

  // Fails if sorting changes its input, or reorders points at one time.
  it("sorts a copy, keeping points at one time in order", () => {
    const input = points([10, 1], [0, 2], [10, 3]);
    const before = JSON.parse(JSON.stringify(input)) as ProfilePoint[];

    const sorted = inTimeOrder(input);

    expect(sorted.map((p) => p.requestsPerSec)).toEqual([2, 1, 3]);
    expect(input).toEqual(before);
  });
});
