import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import { createSaveQueue, type SaveQueue } from "./save-queue";

/** The sample record, named so a test can tell saves apart. */
function recordNamed(name: string): ProjectRecord {
  return { ...sampleRecord, project: { ...sampleRecord.project, name } };
}

/** A save the test ends, saved or not. */
interface PendingSave {
  readonly name: string;
  readonly end: (saved: boolean) => Promise<void>;
}

/** A queue whose saves wait for the test, and what it reported. */
interface QueueUnderTest {
  readonly queue: SaveQueue;
  readonly pending: PendingSave[];
  readonly failedReports: boolean[];
}

function queueUnderTest(): QueueUnderTest {
  const pending: PendingSave[] = [];
  const failedReports: boolean[] = [];
  const queue = createSaveQueue({
    save: (record) =>
      new Promise((resolve) => {
        pending.push({
          name: record.project.name,
          end: async (saved) => {
            resolve(saved);
            // Lets the queue take its next record before the test goes on.
            await new Promise((done) => setTimeout(done, 0));
          },
        });
      }),
    onFailedChange: (failed) => failedReports.push(failed),
  });
  return { queue, pending, failedReports };
}

describe("createSaveQueue", () => {
  // Fails if a second save starts before the first ends (two writes in
  // flight could land out of order), or a newer record waiting behind the
  // one in flight isn't the one saved next.
  it("saves one at a time, the latest record next", async () => {
    const { queue, pending } = queueUnderTest();
    queue.save(recordNamed("one"));
    queue.save(recordNamed("two"));
    queue.save(recordNamed("three"));
    expect(pending.map((save) => save.name)).toEqual(["one"]);

    await pending[0]?.end(true);

    expect(pending.map((save) => save.name)).toEqual(["one", "three"]);
  });

  // Fails if a failed save isn't reported, or retry saves anything but the
  // record that failed, or a save that works doesn't clear the failure.
  it("reports a failure, and retries the record that failed", async () => {
    const { queue, pending, failedReports } = queueUnderTest();
    queue.save(recordNamed("one"));
    await pending[0]?.end(false);
    expect(failedReports).toEqual([true]);

    queue.retry();
    expect(pending[1]?.name).toBe("one");
    await pending[1]?.end(true);

    expect(failedReports).toEqual([true, false]);
  });

  // Fails if a failure is reported while a newer record, which holds the
  // failed change too, is about to be saved.
  it("saves a newer record instead of reporting the older's failure", async () => {
    const { queue, pending, failedReports } = queueUnderTest();
    queue.save(recordNamed("one"));
    queue.save(recordNamed("two"));

    await pending[0]?.end(false);
    await pending[1]?.end(true);

    expect(pending.map((save) => save.name)).toEqual(["one", "two"]);
    expect(failedReports).toEqual([false]);
  });
});
