import type { ComponentRegistry } from "../../domain/components/component-registry";
import { findProjectIssues } from "../../domain/components/find-project-issues";
import type { ValidationIssue } from "../../domain/model/validate-project";
import type { Clock } from "../ports/clock";
import type { ProjectRecord } from "../ports/project-record";
import type { ProjectRepository } from "../ports/project-repository";

export interface SaveProjectDependencies {
  readonly projects: ProjectRepository;
  readonly clock: Clock;
  /** Checks each component's config before saving. */
  readonly registry: ComponentRegistry;
}

export type SaveProjectResult = ProjectSaved | ProjectNotSaved;

export interface ProjectSaved {
  readonly status: "saved";
  /** The record as saved, with its new `updatedAt`. */
  readonly record: ProjectRecord;
}

export interface ProjectNotSaved {
  readonly status: "invalid";
  /** Paths point into the domain `Project`. */
  readonly issues: readonly ValidationIssue[];
}

/**
 * Saves a project the user changed, stamping `updatedAt` from the clock. It
 * refuses a project that fails validation: the repository would store it,
 * but couldn't open it again.
 */
export class SaveProject {
  private readonly deps: SaveProjectDependencies;

  constructor(deps: SaveProjectDependencies) {
    this.deps = deps;
  }

  async execute(record: ProjectRecord): Promise<SaveProjectResult> {
    const issues = findProjectIssues(record.project, this.deps.registry);
    if (issues.length > 0) return { status: "invalid", issues };
    const saved = { ...record, updatedAt: this.deps.clock.now() };
    await this.deps.projects.save(saved);
    return { status: "saved", record: saved };
  }
}
