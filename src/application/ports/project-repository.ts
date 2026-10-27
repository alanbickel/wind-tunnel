import type { ValidationIssue } from "../../domain/model/validation-issue";
import type { ProjectRecord, ProjectSummary } from "./project-record";

/**
 * The result of reading one project. A stored project can fail to load if it
 * no longer passes validation, e.g. after a component type's config rules
 * got stricter, so the user is told why it won't open.
 */
export type ProjectLookup = ProjectFound | ProjectMissing | ProjectInvalid;

export interface ProjectFound {
  readonly status: "found";
  readonly record: ProjectRecord;
}

export interface ProjectMissing {
  readonly status: "missing";
}

export interface ProjectInvalid {
  readonly status: "invalid";
  /**
   * One plain sentence for the user, e.g. "This project was saved by a newer
   * version of Wind Tunnel." The details are in `issues`.
   */
  readonly reason: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * The user's saved projects (MVP design §5.1). The MVP adapter is IndexedDB
 * (ADR-0004). Every implementation must pass `checkProjectRepositoryContract`.
 */
export interface ProjectRepository {
  /** Every saved project, most recently updated first. */
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectLookup>;
  /** Inserts, or replaces the project with the same ID. Stores the record as given. */
  save(record: ProjectRecord): Promise<void>;
  /** Does nothing if there's no such project. */
  delete(id: string): Promise<void>;
}
