import { describe, expect, it } from "vitest";
import { FixedClock } from "../testing/fixed-clock";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { InMemoryTemplateCatalog } from "../testing/in-memory-template-catalog";
import { SequentialIds } from "../testing/sequential-ids";
import { sampleRecord } from "../testing/sample-record";
import { CreateProjectFromTemplate } from "./create-project-from-template";

const NOW = "2026-10-15T12:00:00.000Z";
const TEMPLATE_ID = sampleRecord.project.id;

function setUp() {
  const projects = new InMemoryProjectRepository();
  const createProject = new CreateProjectFromTemplate({
    templates: new InMemoryTemplateCatalog([sampleRecord]),
    projects,
    clock: new FixedClock(NOW),
    ids: new SequentialIds("project"),
  });
  return { projects, createProject };
}

describe("CreateProjectFromTemplate", () => {
  it("saves a copy with a new ID and timestamps, keeping everything else", async () => {
    const { projects, createProject } = setUp();

    const result = await createProject.execute(TEMPLATE_ID);

    const expected = {
      ...sampleRecord,
      project: { ...sampleRecord.project, id: "project-1" },
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(result).toEqual({ status: "created", record: expected });
    expect(await projects.get("project-1")).toEqual({
      status: "found",
      record: expected,
    });
  });

  it("gives each copy of the same template its own ID", async () => {
    const { projects, createProject } = setUp();

    await createProject.execute(TEMPLATE_ID);
    await createProject.execute(TEMPLATE_ID);

    const ids = (await projects.list()).map((s) => s.id).sort();
    expect(ids).toEqual(["project-1", "project-2"]);
  });

  it("reports an unknown template and saves nothing", async () => {
    const { projects, createProject } = setUp();

    expect(await createProject.execute("template-z")).toEqual({
      status: "template-missing",
    });
    expect(await projects.list()).toEqual([]);
  });
});
