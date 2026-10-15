import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ProjectRecord } from "../ports/project-record";
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
 * ID and fresh timestamps. It keeps the template's name, model, layout, and
 * `source`, which names the template and version it came from.
 */
export class CreateProjectFromTemplate {
  private readonly deps: CreateProjectFromTemplateDependencies;

  constructor(deps: CreateProjectFromTemplateDependencies) {
    this.deps = deps;
  }

  async execute(templateId: string): Promise<CreateProjectResult> {
    const template = await this.deps.templates.get(templateId);
    if (template === undefined) return { status: "template-missing" };
    const record = this.copyOf(template);
    await this.deps.projects.save(record);
    return { status: "created", record };
  }

  private copyOf(template: ProjectRecord): ProjectRecord {
    const id = this.deps.ids.newId();
    const now = this.deps.clock.now();
    return {
      ...template,
      project: { ...template.project, id },
      createdAt: now,
      updatedAt: now,
    };
  }
}
