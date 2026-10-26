import type { Verdict } from "../../application/run-analysis/findings/verdict";
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
