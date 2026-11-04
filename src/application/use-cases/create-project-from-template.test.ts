import { describe, expect, it } from "vitest";
import type { Project, Step } from "../../domain/model/project";
import { mapSteps, stepsOf } from "../../domain/model/step-tree";
import type { ProjectRecord } from "../ports/project-record";
import { FixedClock } from "../testing/fixed-clock";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { InMemoryTemplateCatalog } from "../testing/in-memory-template-catalog";
import { SequentialIds } from "../testing/sequential-ids";
import { sampleRecord } from "../testing/sample-record";
import { CreateProjectFromTemplate } from "./create-project-from-template";

const NOW = "2026-10-15T12:00:00.000Z";
const TEMPLATE_ID = sampleRecord.project.id;

/** The sample, with a workflow whose queue step has async work. */
const template: ProjectRecord = {
  ...sampleRecord,
  project: {
    ...sampleRecord.project,
    workflows: [
      ...sampleRecord.project.workflows,
      {
        id: "queue",
        name: "Queue item",
        root: {
          id: "queue-api",
          componentId: "api",
          action: "invoke",
          calls: [
            {
              id: "queue-q",
              componentId: "q",
              action: "enqueue",
              async: { id: "queue-fn", componentId: "fn", action: "invoke" },
            },
          ],
        },
      },
    ],
  },
};

function setUp() {
  const projects = new InMemoryProjectRepository();
  const createProject = new CreateProjectFromTemplate({
    templates: new InMemoryTemplateCatalog([template]),
    projects,
    clock: new FixedClock(NOW),
    ids: new SequentialIds("project"),
  });
  return { projects, createProject };
}

describe("CreateProjectFromTemplate", () => {
  // Fails if the copy changes anything but its ID, timestamps, and step IDs,
  // or the saved copy differs from the one returned.
  it("saves a copy with a new ID and timestamps, keeping everything else", async () => {
    const { projects, createProject } = setUp();

    const result = await createProject.execute(TEMPLATE_ID);
    if (result.status !== "created") throw new Error(result.status);

    const { project, ...rest } = result.record;
    expect(rest).toEqual({
      ...template,
      project: undefined,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(withoutStepIds(project)).toEqual(
      withoutStepIds({ ...template.project, id: "project-1" }),
    );
    expect(await projects.get("project-1")).toEqual({
      status: "found",
      record: result.record,
    });
  });

  // Fails if the copy keeps a template's step ID, skips async work, or
  // takes step IDs from anywhere but the IdGenerator.
  it("gives every step, async work included, a new ID", async () => {
    const { createProject } = setUp();

    const result = await createProject.execute(TEMPLATE_ID);
    if (result.status !== "created") throw new Error(result.status);

    const stepIds = stepsOf(result.record.project).map(({ step }) => step.id);
    expect(stepIds.toSorted()).toEqual(
      ["project-2", "project-3", "project-4"]
        .concat(["project-5", "project-6", "project-7"])
        .toSorted(),
    );
  });

  // Fails if two copies share an ID, or step IDs stop coming from the same
  // IdGenerator as the project's.
  it("gives each copy of the same template its own ID", async () => {
    const { projects, createProject } = setUp();

    await createProject.execute(TEMPLATE_ID);
    await createProject.execute(TEMPLATE_ID);

    // The first copy takes project-1 for itself and the next six for its
    // steps, so the second copy is project-8.
    const ids = (await projects.list()).map((s) => s.id).sort();
    expect(ids).toEqual(["project-1", "project-8"]);
  });

  // Fails if a copy keeps a name another project uses, or numbering
  // reuses a number already taken.
  it("numbers a copy whose name is taken: (2), then (3)", async () => {
    const { createProject } = setUp();

    const names = [];
    for (let copy = 0; copy < 3; copy++) {
      const result = await createProject.execute(TEMPLATE_ID);
      if (result.status !== "created") throw new Error(result.status);
      names.push(result.record.project.name);
    }

    expect(names).toEqual([
      "Sample project",
      "Sample project (2)",
      "Sample project (3)",
    ]);
  });

  it("reports an unknown template and saves nothing", async () => {
    const { projects, createProject } = setUp();

    expect(await createProject.execute("template-z")).toEqual({
      status: "template-missing",
    });
    expect(await projects.list()).toEqual([]);
  });
});

/** The project with every step's ID blanked, to compare trees. */
function withoutStepIds(project: Project): Project {
  const blank = (step: Step): Step => ({ ...step, id: "" });
  return {
    ...project,
    workflows: project.workflows.map((w) => ({
      ...w,
      root: mapSteps(w.root, blank),
    })),
  };
}
