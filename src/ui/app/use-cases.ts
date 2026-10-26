import type { StoragePersistence } from "../../application/ports/storage-persistence";
import type { CheckWorkloads } from "../../application/use-cases/check-workloads";
import type { CreateProjectFromTemplate } from "../../application/use-cases/create-project-from-template";
import type { DescribeSelection } from "../../application/use-cases/describe-selection";
import type { DeleteProject } from "../../application/use-cases/delete-project";
import type { ListProjects } from "../../application/use-cases/list-projects";
import type { ListTemplates } from "../../application/use-cases/list-templates";
import type { NameComponents } from "../../application/use-cases/name-components";
import type { OpenProject } from "../../application/use-cases/open-project";
import type { RunSimulation } from "../../application/use-cases/run-simulation";
import type { SaveProject } from "../../application/use-cases/save-project";

/**
 * A use case as a component sees it: only `execute`. A class with private
 * fields accepts only its own instances, so typing the role this way lets a
 * test hand in a plain object instead (ADR-0009).
 */
export type UseCase<T extends UseCaseShape> = Pick<T, "execute">;

interface UseCaseShape {
  execute: unknown;
}

/**
 * Everything the UI calls, built by the composition root (`main.tsx`) and
 * read with `useUseCases`.
 */
export interface UseCases {
  readonly listProjects: UseCase<ListProjects>;
  readonly listTemplates: UseCase<ListTemplates>;
  readonly createProjectFromTemplate: UseCase<CreateProjectFromTemplate>;
  readonly openProject: UseCase<OpenProject>;
  readonly saveProject: UseCase<SaveProject>;
  readonly deleteProject: UseCase<DeleteProject>;
  readonly runSimulation: UseCase<RunSimulation>;
  readonly describeSelection: UseCase<DescribeSelection>;
  readonly nameComponents: UseCase<NameComponents>;
  readonly checkWorkloads: UseCase<CheckWorkloads>;
  /**
   * The one port the UI calls directly: when to ask for persistent storage
   * is a UI decision (after the first project is created), not a use case.
   */
  readonly storagePersistence: StoragePersistence;
}
