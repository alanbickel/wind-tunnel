import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { findArchitectureIssues } from "../../domain/components/find-architecture-issues";
import { workloadRunChecks } from "../run-checks/workload-run-checks";
import { projectWithRunIssue } from "./project-with-run-issue";
import { sampleRecord } from "./sample-record";

const registry = createAwsComponentRegistry();

describe("sampleRecord", () => {
  // Fails if the sample breaks any rule, so tests that use it as the valid
  // case would pass for the wrong reason.
  it("is a valid project for the AWS registry, and every workload can run", () => {
    const { project } = sampleRecord;
    expect(findArchitectureIssues(project, registry)).toEqual([]);
    const checks = [...workloadRunChecks({ project, registry }).values()];
    expect(checks.map((check) => check.canRun)).toEqual([true]);
  });
});

describe("projectWithRunIssue", () => {
  // Fails if the fixture's architecture breaks, or both workloads stop, so
  // tests that use it no longer test a run issue alone.
  it("has a valid architecture, and only Write rush can't run", () => {
    const project = projectWithRunIssue;
    expect(findArchitectureIssues(project, registry)).toEqual([]);
    const checks = [...workloadRunChecks({ project, registry }).values()];
    expect(checks.map((check) => [check.workloadId, check.canRun])).toEqual([
      ["steady", true],
      ["write-rush", false],
    ]);
  });
});
