import { describe, expect, it } from "vitest";
import {
  DURATION_FIELD,
  RATE_FIELD,
  SEED_FIELD,
  TIME_FIELD,
  WEIGHT_FIELD,
} from "../../application/details/workload-fields";
import { sampleRecord } from "../../application/testing/sample-record";
import { toProjectDocument } from "./project-document-mapper";
import { projectDocumentV2Schema } from "./project-document-v2";

// The stored schema is the authority for a workload's duration and seed;
// the descriptors only word the messages. This checks the two agree.

/** Whether the stored schema accepts the sample with one workload field set. */
function stored(field: "durationSec" | "seed", value: number): boolean {
  const document = toProjectDocument(sampleRecord);
  const [workload] = document.workloads;
  if (workload === undefined) throw new Error("The sample has a workload");
  const changed = { ...document, workloads: [{ ...workload, [field]: value }] };
  return projectDocumentV2Schema.safeParse(changed).success;
}

describe("the workload fields' ranges", () => {
  // Fails if the seed descriptor's range disagrees with the stored schema:
  // 0 and 4,294,967,295 must pass it; 4,294,967,296, -1, and 1.5 must not.
  it("agree with the stored schema for the seed", () => {
    const { min, max } = SEED_FIELD.range;
    expect(max).toBe(4_294_967_295);
    for (const value of [min, max ?? NaN]) {
      expect(stored("seed", value), String(value)).toBe(true);
    }
    for (const value of [4_294_967_296, -1, 1.5]) {
      expect(stored("seed", value), String(value)).toBe(false);
    }
  });

  // Fails if the duration descriptor's range disagrees with the stored
  // schema: 0 must fail, 0.5 s must pass, and there's no top.
  it("agree with the stored schema for the duration", () => {
    expect(DURATION_FIELD.range).toEqual({
      min: 0,
      minExclusive: true,
      max: undefined,
    });
    expect(stored("durationSec", 0)).toBe(false);
    expect(stored("durationSec", -1)).toBe(false);
    expect(stored("durationSec", 0.5)).toBe(true);
    expect(stored("durationSec", 1e9)).toBe(true);
  });

  /** Whether the stored schema accepts the sample with its first entry's weight set. */
  function storedWeight(weight: number): boolean {
    const document = toProjectDocument(sampleRecord);
    const [workload] = document.workloads;
    const [entry] = workload?.mix ?? [];
    if (workload === undefined || entry === undefined) {
      throw new Error("The sample has a workload with a mix entry");
    }
    const mix = [{ ...entry, weight }];
    const changed = { ...document, workloads: [{ ...workload, mix }] };
    return projectDocumentV2Schema.safeParse(changed).success;
  }

  // Fails if the weight descriptor's range disagrees with the stored schema:
  // 0 and -5 must fail, 0.5 must pass, and there's no top.
  it("agree with the stored schema for a mix weight", () => {
    expect(WEIGHT_FIELD.range).toEqual({
      min: 0,
      minExclusive: true,
      max: undefined,
    });
    expect(storedWeight(0)).toBe(false);
    expect(storedWeight(-5)).toBe(false);
    expect(storedWeight(0.5)).toBe(true);
    expect(storedWeight(1e9)).toBe(true);
  });

  /** Whether the stored schema accepts the sample with its first point set. */
  function storedPoint(point: {
    atSec: number;
    requestsPerSec: number;
  }): boolean {
    const document = toProjectDocument(sampleRecord);
    const [workload] = document.workloads;
    if (workload === undefined) throw new Error("The sample has a workload");
    const changed = {
      ...document,
      workloads: [{ ...workload, profile: [point] }],
    };
    return projectDocumentV2Schema.safeParse(changed).success;
  }

  // Fails if the time or rate descriptor's range disagrees with the stored
  // schema: 0 must pass and -1 must fail, for each, and there's no top.
  it("agree with the stored schema for a profile point", () => {
    for (const field of [TIME_FIELD, RATE_FIELD]) {
      expect(field.range).toEqual({
        min: 0,
        minExclusive: false,
        max: undefined,
      });
    }
    expect(storedPoint({ atSec: 0, requestsPerSec: 0 })).toBe(true);
    expect(storedPoint({ atSec: 1e9, requestsPerSec: 1e9 })).toBe(true);
    expect(storedPoint({ atSec: -1, requestsPerSec: 1 })).toBe(false);
    expect(storedPoint({ atSec: 1, requestsPerSec: -1 })).toBe(false);
  });
});
