import { summaryOf, type ProjectRecord } from "../ports/project-record";
import type {
  TemplateCatalog,
  TemplateSummary,
} from "../ports/template-catalog";

/**
 * Serves the given records as templates, keyed by project ID, in the order
 * given. Each record's `source` supplies the version (1 if it has none), and
 * `get` returns a copy, as the bundled catalog's records can't be changed.
 */
export class InMemoryTemplateCatalog implements TemplateCatalog {
  private readonly templates: readonly ProjectRecord[];

  constructor(templates: readonly ProjectRecord[]) {
    this.templates = templates;
  }

  list(): Promise<TemplateSummary[]> {
    return Promise.resolve(this.templates.map(templateSummaryOf));
  }

  get(id: string): Promise<ProjectRecord | undefined> {
    const template = this.templates.find((t) => t.project.id === id);
    return Promise.resolve(
      template === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(template)) as ProjectRecord),
    );
  }
}

function templateSummaryOf(template: ProjectRecord): TemplateSummary {
  const { id, name, description } = summaryOf(template);
  const version = template.source?.templateVersion ?? 1;
  return description === undefined
    ? { id, version, name }
    : { id, version, name, description };
}
