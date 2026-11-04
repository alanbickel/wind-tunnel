import { freeProjectName } from "../details/project-name";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ProjectRecord, ProjectSummary } from "../ports/project-record";
import type { ProjectRepository } from "../ports/project-repository";
import type { TemplateCatalog } from "../ports/template-catalog";

export interface CreateProjectFromTemplateDependencies {
  readonly templates: TemplateCatalog;
  readonly projects: ProjectRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type CreateProjectResult = ProjectCreated | TemplateMissing;

export interface ProjectCreated {
  readonly status: "created";
  /** The new project, as saved. */
  readonly record: ProjectRecord;
}

export interface TemplateMissing {
  readonly status: "template-missing";
}

/**
 * Copies a template into a new saved project (ADR-0004). The copy gets a new
 * ID and fresh timestamps. It keeps the template's model, layout, and
 * `source`, which names the template and version it came from, and its
 * name, numbered if another project uses it: "Serverless API with RDS (2)".
 */
export class CreateProjectFromTemplate {
  private readonly deps: CreateProjectFromTemplateDependencies;

  constructor(deps: CreateProjectFromTemplateDependencies) {
    this.deps = deps;
  }

  async execute(templateId: string): Promise<CreateProjectResult> {
    const template = await this.deps.templates.get(templateId);
    if (template === undefined) return { status: "template-missing" };
    const projects = await this.deps.projects.list();
    const record = this.copyOf(template, projects);
    await this.deps.projects.save(record);
    return { status: "created", record };
  }

  private copyOf(
    template: ProjectRecord,
    projects: readonly ProjectSummary[],
  ): ProjectRecord {
    const id = this.deps.ids.newId();
    const name = freeProjectName(template.project.name, projects);
    const now = this.deps.clock.now();
    return {
      ...template,
      project: { ...template.project, id, name },
      createdAt: now,
      updatedAt: now,
    };
  }
}
