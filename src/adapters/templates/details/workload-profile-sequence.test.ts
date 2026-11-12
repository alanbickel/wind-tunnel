import { describe, expect, it } from "vitest";
import { durationMsOf } from "../../../application/details/workload-fields";
import {
  nextPointAtMs,
  rowAfterMove,
} from "../../../application/edits/profile-points";
import {
  addedPointName,
  movedMessage,
  rateChangeName,
  timeChangeName,
} from "../../../application/edits/profile-step-names";
import {
  addProfilePoint,
  addWorkload,
  setProfilePoint,
} from "../../../application/edits/workload-edits";
import type { ProjectRecord } from "../../../application/ports/project-record";
import { sampleRecord } from "../../../application/testing/sample-record";
import type { Workload } from "../../../domain/model/project";

// The worked example in docs/architecture/workload-editor.md: the "Lunch
// rush" profile of UX design §2.1 step 7, built from a new workload's one
// point the way the screen does it, and the table after each step. Accept an
// intended change with `npx vitest run src/adapters/templates/details
// --update`, then check the guide still matches.

const NAME = "Lunch rush";
const ID = "lunch";

/** The workload's table, as `time/rate` pairs in the order the screen shows. */
function tableOf({ project }: ProjectRecord): string {
  const workload = project.workloads.find((w) => w.id === ID) as Workload;
  return workload.profile
    .map((p) => `${String(p.atMs / 1000)}/${String(p.requestsPerSec)}`)
    .join("  ");
}

/** What one step of the example is: its words, the table it leaves, and what's announced. */
interface Stage {
  readonly step: string;
  readonly record: ProjectRecord;
  readonly said?: string;
}

/** Adds a point where "Add point" puts it. */
function add(record: ProjectRecord): Stage {
  const { profile } = record.project.workloads.find(
    (w) => w.id === ID,
  ) as Workload;
  const atMs = nextPointAtMs(profile.map((p) => p.atMs));
  return {
    step: addedPointName({ workloadName: NAME, atMs }),
    record: addProfilePoint(record, { workloadId: ID, atMs }),
  };
}

/** Types a rate over the point at `atMs`. */
function rate(
  record: ProjectRecord,
  atMs: number,
  requestsPerSec: number,
): Stage {
  return {
    step: rateChangeName({ workloadName: NAME, atMs, requestsPerSec }),
    record: setProfilePoint(record, {
      workloadId: ID,
      atMs,
      change: { requestsPerSec },
    }),
  };
}

/** Types a time over the point at `atMs`, and says what the screen announces. */
function time(record: ProjectRecord, atMs: number, seconds: number): Stage {
  const { profile } = record.project.workloads.find(
    (w) => w.id === ID,
  ) as Workload;
  const newAtMs = durationMsOf(seconds);
  const timesMs = profile.map((p) => p.atMs);
  const from = timesMs.indexOf(atMs);
  const to = rowAfterMove({ timesMs, index: from, atMs: newAtMs });
  return {
    step: timeChangeName({ workloadName: NAME, atMs, newAtMs }),
    record: setProfilePoint(record, {
      workloadId: ID,
      atMs,
      change: { atMs: newAtMs },
    }),
    said: movedMessage({ from, to, rowCount: timesMs.length }),
  };
}

/** Each step, then the table it leaves. */
function trace(): string {
  const [steady] = sampleRecord.project.workloads;
  if (steady === undefined) throw new Error("The sample has a workload");
  const start = addWorkload(
    { ...sampleRecord, project: { ...sampleRecord.project, workloads: [] } },
    { workloadId: ID },
  );
  const renamed = {
    ...start,
    project: {
      ...start.project,
      workloads: start.project.workloads.map((w) => ({
        ...w,
        name: NAME,
        profile: [{ atMs: 0, requestsPerSec: 200 }],
      })),
    },
  };
  const stages: Stage[] = [];
  const next = (make: (record: ProjectRecord) => Stage): void => {
    stages.push(make(stages.at(-1)?.record ?? renamed));
  };
  next(add);
  next(add);
  next((r) => rate(r, 20_000, 2000));
  next(add);
  next((r) => time(r, 30_000, 40));
  next(add);
  next((r) => rate(r, 50_000, 200));
  next((r) => time(r, 20_000, 45));
  const lines = stages.flatMap(({ step, record, said }) => [
    step,
    `  ${tableOf(record)}`,
    ...(said === undefined ? [] : [`  Announced: ${said}`]),
  ]);
  return ["A new workload", `  ${tableOf(renamed)}`, ...lines].join("\n");
}

describe("the profile's worked example", () => {
  // Fails if building Lunch rush, or moving a point to its place, changes
  // without the guide's trace changing too.
  it("builds Lunch rush from one point, and moves a point", async () => {
    await expect(`${trace()}\n`).toMatchFileSnapshot(
      "workload-profile-sequence.txt",
    );
  });
});
