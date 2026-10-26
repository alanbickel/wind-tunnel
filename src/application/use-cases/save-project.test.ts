import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { FixedClock } from "../testing/fixed-clock";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { projectWithRunIssue } from "../testing/project-with-run-issue";
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

  // Fails if SaveProject checks the run issues as well as the architecture.
  it("saves a project whose step calls a missing component", async () => {
    const { projects, saveProject } = setUp();
    const record = { ...sampleRecord, project: projectWithRunIssue };

    const result = await saveProject.execute(record);

    expect(result).toMatchObject({ status: "saved" });
    expect(await projects.list()).toHaveLength(1);
  });

  // Fails if SaveProject stops checking the architecture.
  it("refuses a duplicate name, says why, and saves nothing", async () => {
    const { projects, saveProject } = setUp();
    const { architecture } = sampleRecord.project;
    // A second Lambda, also named "Function".
    const fn = architecture.components.find((c) => c.id === "fn");
    if (fn === undefined) throw new Error("The sample has a function");
    const components = architecture.components.map((c) =>
      c.id === "table" ? { ...fn, id: "table" } : c,
    );
    const project = {
      ...sampleRecord.project,
      architecture: { ...architecture, components },
    };

    const result = await saveProject.execute({ ...sampleRecord, project });

    expect(result).toMatchObject({
      status: "invalid",
      issues: [{ path: ["architecture", "components", 2, "name"] }],
    });
    expect(await projects.list()).toEqual([]);
  });
});
