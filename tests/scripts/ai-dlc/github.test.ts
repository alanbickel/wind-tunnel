import { describe, expect, it } from "vitest";
import type {
  CheckRun,
  CiResults,
  CombinedStatus,
} from "../../../scripts/ai-dlc/github.js";
import { ciGreen } from "../../../scripts/ai-dlc/github.js";

const PASSED: CheckRun = {
  name: "check",
  status: "completed",
  conclusion: "success",
};
const NO_STATUSES: CombinedStatus = { state: "pending", total_count: 0 };

const results = (
  checkRuns: CheckRun[],
  combinedStatus: CombinedStatus,
): CiResults => ({ checkRuns, combinedStatus });

describe("ciGreen", () => {
  // Fails if a passing check run with no commit statuses isn't green: GitHub
  // reports "pending" when there are no statuses at all.
  it("is green when every check run passed and there are no commit statuses", () => {
    expect(ciGreen(results([PASSED], NO_STATUSES))).toBe(true);
  });

  // Fails if commit statuses are ignored: a failing Snyk status (a status, not
  // a check run) would let the driver merge a red PR.
  it("is red when a commit status failed, though every check run passed", () => {
    expect(
      ciGreen(results([PASSED], { state: "failure", total_count: 1 })),
    ).toBe(false);
  });

  // Fails if a status still running counts as passed.
  it("is red while a commit status is pending", () => {
    expect(
      ciGreen(results([PASSED], { state: "pending", total_count: 1 })),
    ).toBe(false);
  });

  // Fails if a passing status is read as a failure.
  it("is green when the commit statuses passed", () => {
    expect(
      ciGreen(results([PASSED], { state: "success", total_count: 1 })),
    ).toBe(true);
  });

  // Fails if a failed check run counts as green.
  it("is red when a check run failed", () => {
    const failed: CheckRun = { ...PASSED, conclusion: "failure" };
    expect(ciGreen(results([PASSED, failed], NO_STATUSES))).toBe(false);
  });

  // Fails if a commit CI hasn't registered yet counts as green.
  it("is red when there are no check runs yet", () => {
    expect(ciGreen(results([], NO_STATUSES))).toBe(false);
  });
});
