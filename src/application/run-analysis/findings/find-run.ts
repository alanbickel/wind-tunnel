import type { RunSoFar } from "../run-so-far";
import type { Detector } from "./detector";
import { linkCauses } from "./link-causes";
import { orderFindings, type FindingNode } from "./order-findings";
import { verdictOf, type Verdict } from "./verdict";

/** What a run means: its verdict, then its findings. */
export interface RunFindings {
  readonly verdict: Verdict;
  /** Top-level findings in order, each with its causes beneath it. */
  readonly findings: readonly FindingNode[];
}

/**
 * Runs every detector over the run so far, links each cause note to the
 * findings it explains, nests and orders them, and adds the verdict
 * (findings.md §3.5). Pure: the same run gives the same result, so the run
 * panel can call it again as each snapshot arrives.
 */
export function findRun(
  run: RunSoFar,
  detectors: readonly Detector[],
): RunFindings {
  const all = linkCauses(detectors.flatMap((d) => d.detect(run)));
  return { verdict: verdictOf(run, all), findings: orderFindings(all) };
}
