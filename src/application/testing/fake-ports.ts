import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ProjectRecord, ProjectSummary } from "../ports/project-record";
import type {
  ProjectLookup,
  ProjectRepository,
} from "../ports/project-repository";

// Simple, in-memory port implementations for use case tests. The repository
// passes `checkProjectRepositoryContract`, the same as the real adapter.

/** Always returns the same time unless the test moves it with `set`. */
export class FixedClock implements Clock {
  private time: string;

  constructor(isoTime: string) {
    this.time = isoTime;
  }

  set(isoTime: string): void {
    this.time = isoTime;
  }

  now(): string {
    return this.time;
  }
}

/** Returns `id-1`, `id-2`, ... (or with another prefix). */
export class SequentialIds implements IdGenerator {
  private readonly prefix: string;
  private next = 1;

  constructor(prefix = "id") {
    this.prefix = prefix;
  }

  newId(): string {
    return `${this.prefix}-${String(this.next++)}`;
  }
}

/** Keeps copies of records, so a caller can't change what's stored. */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly records = new Map<string, string>();

  list(): Promise<ProjectSummary[]> {
    const summaries = [...this.records.values()].map((json) =>
      toSummary(JSON.parse(json) as ProjectRecord),
    );
    summaries.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
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

function toSummary({ project, updatedAt }: ProjectRecord): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.description === undefined
      ? {}
      : { description: project.description }),
    updatedAt,
  };
}
