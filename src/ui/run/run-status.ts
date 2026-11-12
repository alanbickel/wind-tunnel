import type {
  Verdict,
  VerdictLevel,
} from "../../application/run-analysis/findings/verdict";
import { shareDown } from "../../application/run-analysis/number-format";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Workload } from "../../domain/model/project";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { secondsOf } from "./run-charts";
import type { RunMeaning } from "./useRunFindings";
import type { RanModel, RunPhase } from "./useSimulationRun";

/** What the status line says about the latest run. */
export interface StatusTextInput {
  readonly phase: RunPhase;
  /** Simulated seconds received. */
  readonly seconds: number;
  /** What the run means so far, if it has started and caught up. */
  readonly verdict: Verdict | undefined;
}

/**
 * The run's state in words, with its verdict's title; empty before the
 * first run. The title changes only when the level does, or the run ends,
 * so a screen reader hears it then, not on every snapshot.
 */
export function statusText(input: StatusTextInput): string {
  return handleStatus(statusTexts(input), input.phase);
}

/** Each phase's message, given the seconds received and the verdict. */
function statusTexts({
  seconds,
  verdict,
}: StatusTextInput): StatusHandlers<RunPhase, string> {
  const title = verdict === undefined ? "" : ` ${verdict.title}.`;
  return {
    idle: () => "",
    running: ({ workload }) => `Running ${workload.name}…${title}`,
    finished: ({ workload }) => `Finished ${workload.name}.${title}`,
    stopped: ({ workload }) =>
      `Stopped ${workload.name} after ${String(seconds)} of ${String(durationSec(workload))} simulated seconds.${title}`,
    failed: ({ workload, problem }) => `${workload.name} failed: ${problem}`,
  };
}

/** What colours the verdict chip: the verdict's level, or the run's state. */
export type ChipLevel = VerdictLevel | "running" | "error";

/** The verdict chip's words, and the level that colours them. */
export interface VerdictChipText {
  readonly level: ChipLevel;
  /** E.g. "Failing · 43.7%", "Healthy", or "Running · 5 of 20 s". */
  readonly text: string;
}

/**
 * The chip beside Run: the verdict, with the share of answered requests
 * that failed when it's failing (the share the Run tab's summary gives);
 * the run's progress while it goes; nothing before the first run, or until
 * a finished run's verdict has caught up.
 */
export function verdictChipOf(
  input: StatusTextInput,
): VerdictChipText | undefined {
  return handleStatus(chipTexts(input), input.phase);
}

function chipTexts({
  seconds,
  verdict,
}: StatusTextInput): StatusHandlers<RunPhase, VerdictChipText | undefined> {
  return {
    idle: () => undefined,
    running: ({ workload }) => ({
      level: "running",
      text: `Running · ${String(seconds)} of ${String(durationSec(workload))} s`,
    }),
    finished: () => chipOfVerdict(verdict),
    stopped: () => chipOfVerdict(verdict),
    failed: () => ({ level: "error", text: "Run failed" }),
  };
}

function chipOfVerdict(
  verdict: Verdict | undefined,
): VerdictChipText | undefined {
  if (verdict === undefined) return undefined;
  const { level, title, requests } = verdict;
  const answered = requests.succeeded + requests.failed;
  if (level !== "failing" || answered === 0) return { level, text: title };
  const share = shareDown(requests.failed / answered);
  return { level, text: `${title} · ${share}` };
}

/**
 * The verdict of the latest run, once the deferred render reaches it;
 * the run before's would be announced as this one's.
 */
export function currentVerdict(
  meaning: RunMeaning | undefined,
): Verdict | undefined {
  return meaning?.current ? meaning.findings.verdict : undefined;
}

/**
 * What the latest run ran, if there has been one: the phase itself, so it
 * stays the same object until the phase changes.
 */
export function ranModelOf(phase: RunPhase): RanModel | undefined {
  return phase.status === "idle" ? undefined : phase;
}

/** Measured like `simulatedSec`, so a finished run fills the bar. */
export function durationSec(workload: Workload): number {
  return secondsOf(workload.durationMs);
}

/** Simulated time the snapshots cover, from the end of the last one. */
export function simulatedSec(snapshots: readonly MetricsSnapshot[]): number {
  return secondsOf(snapshots.at(-1)?.endMs ?? 0);
}
