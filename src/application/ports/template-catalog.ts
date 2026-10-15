import type { ProjectRecord } from "./project-record";

export interface TemplateSummary {
  readonly id: string;
  /**
   * Increases when the template changes in a way users would notice.
   * Copied into a new project's `source`.
   */
  readonly version: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * The starter projects that ship with the app (MVP design §5.1). The MVP
 * adapter reads the bundled JSON files (ADR-0004).
 */
export interface TemplateCatalog {
  list(): Promise<TemplateSummary[]>;
  /**
   * The template as a record, or `undefined` if there's no such template.
   * Its `source` names the template and its version, ready for a copy to keep.
   * Callers copy it into a new project; they don't save it as is.
   */
  get(id: string): Promise<ProjectRecord | undefined>;
}
