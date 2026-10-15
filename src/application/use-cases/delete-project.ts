import type { ProjectRepository } from "../ports/project-repository";

export interface DeleteProjectDependencies {
  readonly projects: ProjectRepository;
}

/** Deletes a saved project. Deleting one that doesn't exist does nothing. */
export class DeleteProject {
  private readonly projects: ProjectRepository;

  constructor({ projects }: DeleteProjectDependencies) {
    this.projects = projects;
  }

  execute(id: string): Promise<void> {
    return this.projects.delete(id);
  }
}
