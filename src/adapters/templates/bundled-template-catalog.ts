import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import type { ValidationIssue } from "../../domain/model/validation-issue";
import type { ProjectRecord } from "../../application/ports/project-record";
import type {
  TemplateCatalog,
  TemplateSummary,
} from "../../application/ports/template-catalog";
import { loadProject } from "../persistence/load-project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";

/** A template document that ships with the app, and its version. */
export interface BundledTemplate {
  /**
   * Raise it when a change to the template would alter what users see in a
   * run. Projects record the version they were copied from.
   */
  readonly version: number;
  /** The template's project document, as JSON. */
  readonly document: unknown;
}

/** The templates that ship with the app, in the order users see them. */
export const BUNDLED_TEMPLATES: readonly BundledTemplate[] = [
  { version: 1, document: templateA },
  { version: 1, document: templateB },
];

export interface BundledTemplateCatalogDependencies {
  readonly templates: readonly BundledTemplate[];
  readonly registry: ComponentRegistry;
}

/** A loaded template: its list entry and its record. */
interface CatalogEntry {
  readonly summary: TemplateSummary;
  readonly record: ProjectRecord;
}

/**
 * The `TemplateCatalog` over templates bundled with the app (ADR-0004). It
 * loads every template up front, so a broken one fails at startup rather
 * than when a user picks it.
 */
export class BundledTemplateCatalog implements TemplateCatalog {
  private readonly entries: ReadonlyMap<string, CatalogEntry>;

  constructor({ templates, registry }: BundledTemplateCatalogDependencies) {
    this.entries = new Map(
      templates.map((template) => {
        const entry = loadTemplate({ template, registry });
        return [entry.summary.id, entry];
      }),
    );
  }

  list(): Promise<TemplateSummary[]> {
    const summaries = [...this.entries.values()].map((e) => e.summary);
    return Promise.resolve(summaries);
  }

  get(id: string): Promise<ProjectRecord | undefined> {
    return Promise.resolve(this.entries.get(id)?.record);
  }
}

/** The catalog of `BUNDLED_TEMPLATES`, as the app and the CLI use it. */
export function createBundledTemplateCatalog(
  registry: ComponentRegistry,
): BundledTemplateCatalog {
  return new BundledTemplateCatalog({ templates: BUNDLED_TEMPLATES, registry });
}

interface LoadTemplateInput {
  readonly template: BundledTemplate;
  readonly registry: ComponentRegistry;
}

/** The template's catalog entry; throws if the template is invalid. */
function loadTemplate({ template, registry }: LoadTemplateInput): CatalogEntry {
  const loaded = loadProject(template.document, registry);
  if (!loaded.ok) {
    throw new Error(
      `A bundled template is invalid: ${describeIssues(loaded.issues)}`,
    );
  }
  const { project } = loaded.record;
  const summary = templateSummaryOf({ project, version: template.version });
  const source = { templateId: project.id, templateVersion: template.version };
  return { summary, record: { ...loaded.record, source } };
}

function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

interface SummaryInput {
  readonly project: Project;
  readonly version: number;
}

function templateSummaryOf({
  project,
  version,
}: SummaryInput): TemplateSummary {
  return {
    id: project.id,
    version,
    name: project.name,
    ...(project.description === undefined
      ? {}
      : { description: project.description }),
  };
}
