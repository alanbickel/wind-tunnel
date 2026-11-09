import { beforeAll } from "vitest";
import type { Project } from "../../../domain/model/project";
import {
  runRecordingRejections,
  type RunWithRejections,
} from "./rejection-runs";
import { RUN_TIMEOUT_MS } from "./run-template";
import { withSeed } from "./scenario-runs";

/** A template's workload, run on one seed. */
export interface RunSpec {
  readonly project: Project;
  readonly workloadId: string;
  readonly seed: number;
}

/**
 * A finished run, with the project and workload it came from, and every
 * rejection the engine reported during it, so each topic's tests can read
 * the one run.
 */
export interface TemplateRun extends RunWithRejections {
  readonly project: Project;
  readonly workloadId: string;
  readonly seed: number;
}

/** Gets the run once `beforeAll` has made it. */
export type RunGetter = () => TemplateRun;

/**
 * Runs the workload once, in a `beforeAll`, and returns a way to get the run
 * for the tests of every topic that reads it (docs/contributing/testing.md,
 * "One file per run"). Call it inside the `describe` of the run.
 */
export function useRun(spec: RunSpec): RunGetter {
  let made: TemplateRun | undefined;
  beforeAll(() => {
    const { project, workloadId, seed } = spec;
    const run = runRecordingRejections({
      project: withSeed(project, seed),
      workloadId,
    });
    made = { ...run, project, workloadId, seed };
  }, RUN_TIMEOUT_MS);
  return () => {
    if (made === undefined) throw new Error("The run hasn't been made yet");
    return made;
  };
}
