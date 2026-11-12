import { describe, expect, it } from "vitest";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import type { Project, Workload } from "../../domain/model/project";
import { verdictChipOf } from "./run-status";
import type { RunPhase } from "./useSimulationRun";

const workload = {
  id: "w",
  name: "Lunch rush",
  durationMs: 20_000,
} as Workload;
const project = {} as Project;
const ran = { project, workload };

function verdict(level: Verdict["level"], failed: number): Verdict {
  const requests = {
    started: 10,
    succeeded: 10 - failed,
    failed,
    inProgress: 0,
  };
  return {
    level,
    title: level === "failing" ? "Failing" : "Healthy",
    requests,
  } as Verdict;
}

function chip(phase: RunPhase, v?: Verdict, seconds = 5) {
  return verdictChipOf({ phase, seconds, verdict: v });
}

describe("verdictChipOf", () => {
  // Fails if a chip is drawn before the first run.
  it("is empty before a run", () => {
    expect(chip({ status: "idle" })).toBeUndefined();
  });

  // Fails if the chip shows the verdict instead of the progress while a run goes.
  it("shows progress while running", () => {
    expect(chip({ status: "running", ...ran }, verdict("failing", 4))).toEqual({
      level: "running",
      text: "Running · 5 of 20 s",
    });
  });

  // Fails if a failing run's chip leaves out the share of answered requests that failed.
  it("gives a failing run's share, rounded down as the Run tab does", () => {
    expect(chip({ status: "finished", ...ran }, verdict("failing", 3))).toEqual(
      {
        level: "failing",
        text: "Failing · 30.0%",
      },
    );
  });

  // Fails if a healthy run's chip carries a share.
  it("gives a healthy run's title alone", () => {
    expect(chip({ status: "finished", ...ran }, verdict("healthy", 0))).toEqual(
      {
        level: "healthy",
        text: "Healthy",
      },
    );
  });

  // Fails if the chip shows the previous run's verdict before the new one catches up.
  it("is empty until a finished run's verdict has caught up", () => {
    expect(chip({ status: "finished", ...ran })).toBeUndefined();
  });

  // Fails if a failed run draws no chip.
  it("says when the run failed", () => {
    const failed: RunPhase = { status: "failed", ...ran, problem: "boom" };
    expect(chip(failed)).toEqual({ level: "error", text: "Run failed" });
  });
});
