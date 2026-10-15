import type {
  TemplateCatalog,
  TemplateSummary,
} from "../ports/template-catalog";

export interface ListTemplatesDependencies {
  readonly templates: TemplateCatalog;
}

/** The starter projects a user can create a project from. */
export class ListTemplates {
  private readonly templates: TemplateCatalog;

  constructor({ templates }: ListTemplatesDependencies) {
    this.templates = templates;
  }

  execute(): Promise<TemplateSummary[]> {
    return this.templates.list();
  }
}
