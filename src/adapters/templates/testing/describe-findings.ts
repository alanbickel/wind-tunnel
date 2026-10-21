import { beforeAll, describe, expect, it } from "vitest";
import { createDetectors } from "../../../application/run-analysis/findings/create-detectors";
import {
  findRun,
  type RunFindings,
} from "../../../application/run-analysis/findings/find-run";
import type { Finding } from "../../../application/run-analysis/findings/finding";
import type { FindingNode } from "../../../application/run-analysis/findings/order-findings";
import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../../domain/metrics/metrics-collector";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import findingsDoc from "../../../../docs/design/findings.md?raw";
import { formatVerdict } from "../../cli/findings-report";
import { RUN_TIMEOUT_MS } from "./run-template";
import { runScenario } from "./scenario-runs";

// The findings must reconcile with the totals the collector counts on its
// own (ADR-0015): one failure finding per cause, whose `affected` is that
// cause's failed requests, so the findings add up to the run's failures.
// Each run's verdict must also read as findings.md §1 quotes it. The runs
// are split across the files in `../findings/` so they go to different
// test workers.

/** A run to read, and what its findings should be. */
export interface FindingsCase {
  readonly name: string;
  readonly project: Project;
  readonly workloadId: string;
  /** The section of findings.md that quotes this run's verdict, e.g. "1.1". */
  readonly reading: string;
  /** The top-level findings' IDs, in order. */
  readonly findingIds: readonly string[];
}

/** A run and what `findRun` made of it. */
interface ReadRun {
  readonly run: MetricsRun;
  readonly findings: RunFindings;
}

/** Gets the run once `beforeAll` has made it. */
type ReadRunGetter = () => ReadRun;

/** Runs each case at seed 42, the seed findings.md's readings use. */
export function describeFindings(cases: readonly FindingsCase[]): void {
  describe.each(cases)("$name", (c) => {
    const read = readRunOf(c);
    itCountsEachCause(read);
    itSpansEachCause(read);
    itReconcilesTheVerdict(read);
    itListsTheFindings(read, c.findingIds);
    itPrintsTheQuotedVerdict(read, c.reading);
  });
}

function readRunOf({ project, workloadId }: FindingsCase): ReadRunGetter {
  let read: ReadRun | undefined;
  beforeAll(() => {
    const run = runScenario({ project, workloadId, seed: 42 });
    const soFar = { project, workloadId, snapshots: run.snapshots };
    read = { run, findings: findRun(soFar, createDetectors()) };
  }, RUN_TIMEOUT_MS);
  return () => {
    if (read === undefined) throw new Error("The run hasn't been made yet");
    return read;
  };
}

function itCountsEachCause(read: ReadRunGetter): void {
  // Fails if a cause gets no finding (a timeout, or a reason no limit
  // declares, being skipped), two findings, or a count other than the
  // failures the totals give it.
  it("gives each failure cause one finding, counting its failed requests", () => {
    const { run, findings } = read();
    const failures = failureFindings(findings);
    const counted = failures.map((f) => [f.id, f.affected]);
    const expected = [...causesIn(run.totals)].map(([cause, n]) => [
      `failed-requests:${cause}`,
      n,
    ]);
    expect(counted.sort()).toEqual(expected.sort());
    const failed = sum(
      Object.values(run.totals.workflows).map((w) => w.failed),
    );
    expect(sum(failures.map((f) => f.affected ?? 0))).toBe(failed);
  });
}

function itSpansEachCause(read: ReadRunGetter): void {
  // Fails if a failure finding's window starts or ends anywhere but the
  // first and last seconds with a failure from its cause.
  it("spans each failure finding from the first to the last second with its cause", () => {
    const { run, findings } = read();
    for (const finding of failureFindings(findings)) {
      const cause = finding.id.slice("failed-requests:".length);
      expect(finding.window, finding.id).toEqual(
        secondsWith(run.snapshots, cause),
      );
    }
  });
}

function itReconcilesTheVerdict(read: ReadRunGetter): void {
  // Fails if the verdict's counts drop a snapshot or in-progress requests,
  // or if "in progress" stops meaning requests still unanswered at the
  // entry point (every workflow starts at `api` with no retries).
  it("reconciles the verdict's request counts with the totals", () => {
    const { run, findings } = read();
    const { requests } = findings.verdict;
    const totals = Object.values(run.totals.workflows);
    expect(requests).toMatchObject({
      started: sum(totals.map((w) => w.started)),
      succeeded: sum(totals.map((w) => w.succeeded)),
      failed: sum(totals.map((w) => w.failed)),
      inProgress: componentIn(run.totals, "api").inProgress,
    });
    expect(requests.started).toBe(
      requests.succeeded + requests.failed + requests.inProgress,
    );
  });
}

function itListsTheFindings(read: ReadRunGetter, ids: readonly string[]): void {
  // Fails if a detector stops firing, fires where the reading finds
  // nothing, or the order of the top level changes.
  it("lists the expected findings in order", () => {
    const { findings } = read();
    expect(findings.findings.map((n) => n.finding.id)).toEqual(ids);
  });
}

function itPrintsTheQuotedVerdict(read: ReadRunGetter, reading: string): void {
  // Fails if the verdict's level, counts, or headroom line differ from the
  // summary findings.md quotes for the run, so the doc and the code can't
  // drift apart.
  it(`prints the verdict findings.md §${reading} quotes`, () => {
    const { findings } = read();
    expect(formatVerdict(findings.verdict)).toBe(quotedVerdict(reading));
  });
}

/** Every failure finding, causes included. */
function failureFindings({ findings }: RunFindings): Finding[] {
  const walk = (node: FindingNode): Finding[] => [
    node.finding,
    ...node.causes.flatMap(walk),
  ];
  return findings.flatMap(walk).filter((f) => f.severity === "failure");
}

/** Failed requests by cause, over every workflow. */
function causesIn(totals: MetricsSnapshot): Map<string, number> {
  const causes = new Map<string, number>();
  for (const workflow of Object.values(totals.workflows)) {
    for (const [cause, n] of Object.entries(workflow.failures)) {
      causes.set(cause, (causes.get(cause) ?? 0) + n);
    }
  }
  return causes;
}

/** The span a window for the cause should have, from the snapshots alone. */
interface ExpectedSpan {
  readonly fromMs: number | undefined;
  readonly toMs: number | undefined;
}

/** From the start of the first second with the cause to the end of the last. */
function secondsWith(
  snapshots: readonly MetricsSnapshot[],
  cause: string,
): ExpectedSpan {
  const failing = snapshots.filter((s) =>
    Object.values(s.workflows).some((w) => (w.failures[cause] ?? 0) > 0),
  );
  return { fromMs: failing[0]?.startMs, toMs: failing.at(-1)?.endMs };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * The first blockquote under the reading's heading in findings.md, as plain
 * text: the `> ` and the bold and italic marks taken out.
 */
function quotedVerdict(reading: string): string {
  const lines = findingsDoc.split("\n");
  const heading = lines.findIndex((l) => l.startsWith(`### ${reading} `));
  if (heading === -1) throw new Error(`No reading ${reading} in findings.md`);
  const after = lines.slice(heading + 1);
  const quote = after.slice(after.findIndex((l) => l.startsWith("> ")));
  const end = quote.findIndex((l) => !l.startsWith("> "));
  return quote
    .slice(0, end)
    .map((l) => l.slice(2).replaceAll("*", ""))
    .join("\n");
}
