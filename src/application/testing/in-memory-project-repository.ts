import {
  summaryOf,
  type ProjectRecord,
  type ProjectSummary,
} from "../ports/project-record";
import type {
  ProjectLookup,
  ProjectRepository,
} from "../ports/project-repository";
import { compareStrings } from "./compare-strings";

/**
 * Keeps copies of records, so a caller can't change what's stored. Passes
 * `checkProjectRepositoryContract`, the same as the real adapter.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly records = new Map<string, string>();

  list(): Promise<ProjectSummary[]> {
    const summaries = [...this.records.values()].map((json) =>
      summaryOf(JSON.parse(json) as ProjectRecord),
    );
    // Most recently updated first.
    summaries.sort((a, b) => compareStrings(b.updatedAt, a.updatedAt));
    return Promise.resolve(summaries);
  }

  get(id: string): Promise<ProjectLookup> {
    const json = this.records.get(id);
    return Promise.resolve(
      json === undefined
        ? { status: "missing" }
        : { status: "found", record: JSON.parse(json) as ProjectRecord },
    );
  }

  save(record: ProjectRecord): Promise<void> {
    this.records.set(record.project.id, JSON.stringify(record));
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.records.delete(id);
    return Promise.resolve();
  }
}
