import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { FixedClock } from "../testing/fixed-clock";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { sampleRecord } from "../testing/sample-record";
import { SaveProject } from "./save-project";

const NOW = "2026-10-15T12:00:00.000Z";

function setUp() {
  const projects = new InMemoryProjectRepository();
  const saveProject = new SaveProject({
    projects,
    clock: new FixedClock(NOW),
    registry: createAwsComponentRegistry(),
  });
  return { projects, saveProject };
}

describe("SaveProject", () => {
  it("saves the record with updatedAt from the clock, and keeps createdAt", async () => {
    const { projects, saveProject } = setUp();

    const result = await saveProject.execute(sampleRecord);

    const expected = { ...sampleRecord, updatedAt: NOW };
    expect(result).toEqual({ status: "saved", record: expected });
    expect(await projects.get(sampleRecord.project.id)).toEqual({
      status: "found",
      record: expected,
    });
  });

  it("refuses an invalid project, says why, and saves nothing", async () => {
    const { projects, saveProject } = setUp();
    const project = { ...sampleRecord.project, workflows: [] };

    const result = await saveProject.execute({ ...sampleRecord, project });

    expect(result).toMatchObject({
      status: "invalid",
      issues: [{ path: ["workloads", 0, "mix", 0, "workflowId"] }],
    });
    expect(await projects.list()).toEqual([]);
  });
});
