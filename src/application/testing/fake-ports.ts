import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import {
  summaryOf,
  type ProjectRecord,
  type ProjectSummary,
} from "../ports/project-record";
import type {
  ProjectLookup,
  ProjectRepository,
} from "../ports/project-repository";
import type {
  SimulationRequest,
  SimulationRunner,
} from "../ports/simulation-runner";
import type {
  TemplateCatalog,
  TemplateSummary,
} from "../ports/template-catalog";
import { compareStrings } from "./compare-strings";

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

/**
 * Records each request instead of simulating it, and plays back
 * `FAKE_RUN`'s snapshots before resolving with it.
 */
export class RecordingSimulationRunner implements SimulationRunner {
  readonly requests: SimulationRequest[] = [];

  run(
    request: SimulationRequest,
    onSnapshot?: (snapshot: MetricsSnapshot) => void,
  ): Promise<MetricsRun> {
    this.requests.push(request);
    FAKE_RUN.snapshots.forEach((snapshot) => onSnapshot?.(snapshot));
    return Promise.resolve(FAKE_RUN);
  }
}

function emptySnapshot(startMs: number, endMs: number): MetricsSnapshot {
  return { startMs, endMs, components: {}, workflows: {} };
}

/** Two empty one-second snapshots. */
export const FAKE_RUN: MetricsRun = {
  eventsProcessed: 0,
  snapshots: [emptySnapshot(0, 1_000), emptySnapshot(1_000, 2_000)],
  totals: emptySnapshot(0, 2_000),
};
