import { describe, expect, it } from "vitest";
import { FixedClock } from "../testing/fixed-clock";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { sampleRecord } from "../testing/sample-record";
import { SequentialIds } from "../testing/sequential-ids";
import { CreateBlankProject } from "./create-blank-project";

const NOW = "2026-10-15T12:00:00.000Z";

function setUp() {
  const projects = new InMemoryProjectRepository();
  const createBlank = new CreateBlankProject({
    projects,
    clock: new FixedClock(NOW),
    ids: new SequentialIds("project"),
  });
  return { projects, createBlank };
}

describe("CreateBlankProject", () => {
  // Fails if the record keeps anything a blank project shouldn't have (a
  // `source`, a component, a layout entry), or takes its id or times from
  // anywhere but the ports.
  it("saves a project with the name and nothing else, and returns it", async () => {
    const { projects, createBlank } = setUp();

    const result = await createBlank.execute("Orders service");

    const expected = {
      project: {
        id: "project-1",
        name: "Orders service",
        architecture: { components: [], edges: [] },
        workflows: [],
        workloads: [],
      },
      createdAt: NOW,
      updatedAt: NOW,
      layout: { nodes: {} },
    };
    expect(result).toEqual({ status: "created", record: expected });
    expect(await projects.get("project-1")).toEqual({
      status: "found",
      record: expected,
    });
  });

  // Fails if the backstop is missing, or compares names by case.
  it("refuses a name another project uses, and saves nothing", async () => {
    const { projects, createBlank } = setUp();
    await projects.save(sampleRecord);

    expect(await createBlank.execute("sample PROJECT")).toEqual({
      status: "name-taken",
    });
    expect((await projects.list()).map((p) => p.id)).toEqual(["sample"]);
  });
});
