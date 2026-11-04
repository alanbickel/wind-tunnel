import { projectNameTaken } from "../details/project-name";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ProjectRecord } from "../ports/project-record";
import type { ProjectRepository } from "../ports/project-repository";
import type { ProjectCreated } from "./create-project-from-template";

export interface CreateBlankProjectDependencies {
  readonly projects: ProjectRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type CreateBlankProjectResult = ProjectCreated | NameTaken;

/** Another project already uses the name; nothing was saved. */
export interface NameTaken {
  readonly status: "name-taken";
}

/**
 * Saves a new project with nothing in it: the name, and no components,
 * edges, workflows, or workloads (UX design §2.1 step 1, §5). It has no
 * `source`, since it didn't come from a template. The screen checks the
 * name with `checkProjectName` first; this refuses a name another project
 * uses as a backstop.
 */
export class CreateBlankProject {
  private readonly deps: CreateBlankProjectDependencies;

  constructor(deps: CreateBlankProjectDependencies) {
    this.deps = deps;
  }

  /** `name` is saved as given, so pass the checked name. */
  async execute(name: string): Promise<CreateBlankProjectResult> {
    const projects = await this.deps.projects.list();
    if (projectNameTaken({ name, projects })) return { status: "name-taken" };
    const record = this.blank(name);
    await this.deps.projects.save(record);
    return { status: "created", record };
  }

  private blank(name: string): ProjectRecord {
    const now = this.deps.clock.now();
    return {
      project: {
        id: this.deps.ids.newId(),
        name,
        architecture: { components: [], edges: [] },
        workflows: [],
        workloads: [],
      },
      createdAt: now,
      updatedAt: now,
      layout: { nodes: {} },
    };
  }
}
