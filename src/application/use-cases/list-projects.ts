import type { ProjectSummary } from "../ports/project-record";
import type { ProjectRepository } from "../ports/project-repository";

export interface ListProjectsDependencies {
  readonly projects: ProjectRepository;
}

/** The user's saved projects, most recently updated first. */
export class ListProjects {
  private readonly projects: ProjectRepository;

  constructor({ projects }: ListProjectsDependencies) {
    this.projects = projects;
  }

  execute(): Promise<ProjectSummary[]> {
    return this.projects.list();
  }
}
