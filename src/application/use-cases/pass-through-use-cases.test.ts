import { describe, expect, it } from "vitest";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";
import { InMemoryTemplateCatalog } from "../testing/in-memory-template-catalog";
import { sampleRecord } from "../testing/sample-record";
import { DeleteProject } from "./delete-project";
import { ListProjects } from "./list-projects";
import { ListTemplates } from "./list-templates";
import { OpenProject } from "./open-project";

// The use cases that hand straight on to a port. Their behavior is the
// port's; these tests check the wiring.

async function savedRepository(): Promise<InMemoryProjectRepository> {
  const projects = new InMemoryProjectRepository();
  await projects.save(sampleRecord);
  return projects;
}

describe("ListProjects", () => {
  it("lists the saved projects", async () => {
    const projects = await savedRepository();
    const summaries = await new ListProjects({ projects }).execute();
    expect(summaries.map((s) => s.id)).toEqual([sampleRecord.project.id]);
  });
});

describe("ListTemplates", () => {
  it("lists the catalog's templates", async () => {
    const templates = new InMemoryTemplateCatalog([sampleRecord]);
    const summaries = await new ListTemplates({ templates }).execute();
    expect(summaries).toEqual([
      {
        id: sampleRecord.project.id,
        version: 2,
        name: sampleRecord.project.name,
        description: sampleRecord.project.description,
      },
    ]);
  });
});

describe("OpenProject", () => {
  it("returns a saved project", async () => {
    const openProject = new OpenProject({ projects: await savedRepository() });
    expect(await openProject.execute(sampleRecord.project.id)).toEqual({
      status: "found",
      record: sampleRecord,
    });
  });

  it("reports an unknown ID as missing", async () => {
    const openProject = new OpenProject({ projects: await savedRepository() });
    expect(await openProject.execute("nope")).toEqual({ status: "missing" });
  });
});

describe("DeleteProject", () => {
  it("removes the project", async () => {
    const projects = await savedRepository();
    await new DeleteProject({ projects }).execute(sampleRecord.project.id);
    expect(await projects.list()).toEqual([]);
  });
});
