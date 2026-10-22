import { beforeAll, describe, expect, it } from "vitest";
import { createDetectors } from "../../../application/run-analysis/findings/create-detectors";
import {
  findRun,
  type RunFindings,
} from "../../../application/run-analysis/findings/find-run";
import { BUCKET_DRAINED } from "../../../application/run-analysis/findings/detectors/bucket-drained";
import { FAILED_REQUESTS } from "../../../application/run-analysis/findings/detectors/failed-requests";
import { LATE_ASYNC_WORK } from "../../../application/run-analysis/findings/detectors/late-async-work";
import { WAITING_HOLDS_LIMIT } from "../../../application/run-analysis/findings/detectors/waiting-holds-limit";
import type {
  Finding,
  FindingKey,
} from "../../../application/run-analysis/findings/finding";
import {
  findingKey,
  sameKey,
} from "../../../application/run-analysis/findings/finding-key";
import type { FindingNode } from "../../../application/run-analysis/findings/order-findings";
import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../../domain/metrics/metrics-collector";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import findingsDoc from "../../../../docs/design/findings.md?raw";
import { formatMessage, formatVerdict } from "../../cli/findings-report";
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
  /** The top-level findings, in order, each with its causes beneath it. */
  readonly findings: readonly ExpectedFinding[];
}

/** A finding expected in the tree, with the findings beneath it. */
export interface ExpectedFinding {
  readonly key: FindingKey;
  /** Where its `causeWindow` starts. Left out: it has none. */
  readonly causeFromMs?: number;
  /**
   * Its summary and reasons as the CLI prints them. Left out: not checked,
   * since `findings-report.test.ts`'s snapshots pin the shipped runs.
   */
  readonly sentences?: readonly string[];
  /** Left out: none. */
  readonly causes?: readonly ExpectedFinding[];
}

/** failed-requests' key for a cause. */
export function failedRequests(
  componentId: string,
  reason: string,
): FindingKey {
  return findingKey({ kind: FAILED_REQUESTS, componentId, reason });
}

export function lateAsyncWork(queueId: string): FindingKey {
  return findingKey({ kind: LATE_ASYNC_WORK, componentId: queueId });
}

export function waitingHoldsLimit(
  componentId: string,
  limitName: string,
): FindingKey {
  return findingKey({ kind: WAITING_HOLDS_LIMIT, componentId, limitName });
}

export function bucketDrained(
  componentId: string,
  limitName: string,
): FindingKey {
  return findingKey({ kind: BUCKET_DRAINED, componentId, limitName });
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
    itStartsNoCauseEarly(read);
    itReconcilesTheVerdict(read);
    itListsTheFindings(read, c.findings);
    itPrintsThePinnedSentences(read, c.findings);
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
  // Fails if a cause gets no finding or two, or a count other than the
  // failures the totals give it.
  it("gives each failure cause one finding, counting its failed requests", () => {
    const { run, findings } = read();
    const failures = failureFindings(findings);
    const counted = failures.map((f) => [causeOf(f), f.affected]);
    const expected = [...causesIn(run.totals)];
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
      const cause = causeOf(finding);
      expect(finding.window, cause).toEqual(secondsWith(run.snapshots, cause));
    }
  });
}

function itStartsNoCauseEarly(read: ReadRunGetter): void {
  // Fails if failed-requests' walk-back stops checking whether the limit was
  // out, or a failure finding gets a cause window in a shipped run. In every
  // shipped run, the limits it names run out in exactly the failing seconds
  // (findings.md §3.1); the earlier starts belong on the note detectors' own
  // findings, so their arrival shows up here.
  it("gives no failure finding a cause window before its first failure", () => {
    const { findings } = read();
    for (const finding of failureFindings(findings)) {
      expect(finding.causeWindow, causeOf(finding)).toBeUndefined();
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

function itListsTheFindings(
  read: ReadRunGetter,
  expected: readonly ExpectedFinding[],
): void {
  // Fails if a detector stops firing, fires where the reading finds
  // nothing, a cause shows anywhere but beneath what it explains, the order
  // changes, or a cause window starts at another second.
  it("lists the expected findings in order, each cause beneath what it explains", () => {
    const { findings } = read();
    expect(actualTree(findings.findings)).toEqual(expectedTree(expected));
  });
}

/** A finding's place in the tree, as the tests compare it. */
interface TreeNode {
  readonly key: FindingKey;
  readonly causeFromMs: number | undefined;
  readonly causes: readonly TreeNode[];
}

function actualTree(nodes: readonly FindingNode[]): TreeNode[] {
  return nodes.map(({ finding, causes }) => ({
    key: finding.key,
    causeFromMs: finding.causeWindow?.fromMs,
    causes: actualTree(causes),
  }));
}

function expectedTree(nodes: readonly ExpectedFinding[]): TreeNode[] {
  return nodes.map((n) => ({
    key: n.key,
    causeFromMs: n.causeFromMs,
    causes: expectedTree(n.causes ?? []),
  }));
}

function itPrintsThePinnedSentences(
  read: ReadRunGetter,
  expected: readonly ExpectedFinding[],
): void {
  const pinned = flatten(expected).filter((e) => e.sentences !== undefined);
  if (pinned.length === 0) return;
  // Fails if a pinned finding's summary or reasons quote other numbers or
  // seconds than the reading's.
  it("says what the reading says in the pinned findings", () => {
    const { findings } = read();
    const all = findings.findings.flatMap(walk);
    for (const { key, sentences } of pinned) {
      const finding = all.find((f) => sameKey(f.key, key));
      const text = [finding?.summary ?? [], ...(finding?.reasons ?? [])];
      expect(text.map(formatMessage), key.kind).toEqual(sentences);
    }
  });
}

function flatten(nodes: readonly ExpectedFinding[]): ExpectedFinding[] {
  return nodes.flatMap((n) => [n, ...flatten(n.causes ?? [])]);
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

/** The node's finding, then every finding beneath it. */
function walk(node: FindingNode): Finding[] {
  return [node.finding, ...node.causes.flatMap(walk)];
}

/** Every failure finding, causes included. */
function failureFindings({ findings }: RunFindings): Finding[] {
  return findings.flatMap(walk).filter((f) => f.severity === "failure");
}

/** A failure finding's cause, as the snapshots key it. */
function causeOf({ key }: Finding): string {
  return `${key.componentId}: ${key.reason ?? ""}`;
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
