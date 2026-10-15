import type {
  ProjectLookup,
  ProjectRepository,
} from "../ports/project-repository";

export interface OpenProjectDependencies {
  readonly projects: ProjectRepository;
}

/**
 * One saved project, ready to view or run, or the reason it can't be
 * opened. MVP design §5.2 called this `LoadProject`; it was renamed so it
 * isn't confused with the persistence adapter's `loadProject`, which parses
 * documents.
 */
export class OpenProject {
  private readonly projects: ProjectRepository;

  constructor({ projects }: OpenProjectDependencies) {
    this.projects = projects;
  }

  execute(id: string): Promise<ProjectLookup> {
    return this.projects.get(id);
  }
}
