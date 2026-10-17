import type { ProjectRecord } from "../../../application/ports/project-record";
import { FixedClock } from "../../../application/testing/fixed-clock";
import { InMemoryProjectRepository } from "../../../application/testing/in-memory-project-repository";
import { InMemoryTemplateCatalog } from "../../../application/testing/in-memory-template-catalog";
import { SequentialIds } from "../../../application/testing/sequential-ids";
import { CreateProjectFromTemplate } from "../../../application/use-cases/create-project-from-template";
import { DeleteProject } from "../../../application/use-cases/delete-project";
import { ListProjects } from "../../../application/use-cases/list-projects";
import { ListTemplates } from "../../../application/use-cases/list-templates";
import { OpenProject } from "../../../application/use-cases/open-project";
import type { UseCases } from "../use-cases";
import { fakeUseCases } from "./fake-use-cases";

export interface InMemoryUseCases {
  readonly useCases: UseCases;
  /** Survives unmounting, like IndexedDB across a page reload. */
  readonly projects: InMemoryProjectRepository;
}

/**
 * The real project use cases over in-memory adapters, for UI tests that
 * follow a user through several steps. The rest are `fakeUseCases`.
 */
export function inMemoryUseCases(
  templates: readonly ProjectRecord[],
): InMemoryUseCases {
  const projects = new InMemoryProjectRepository();
  const catalog = new InMemoryTemplateCatalog(templates);
  const clock = new FixedClock("2026-10-17T12:00:00.000Z");
  const ids = new SequentialIds("project");
  const useCases = fakeUseCases({
    listProjects: new ListProjects({ projects }),
    listTemplates: new ListTemplates({ templates: catalog }),
    createProjectFromTemplate: new CreateProjectFromTemplate({
      templates: catalog,
      projects,
      clock,
      ids,
    }),
    openProject: new OpenProject({ projects }),
    deleteProject: new DeleteProject({ projects }),
  });
  return { useCases, projects };
}
