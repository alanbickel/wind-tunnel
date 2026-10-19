import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import type {
  SimulationRequest,
  SimulationRunner,
} from "../ports/simulation-runner";
import { ManualStopSignal } from "./manual-stop-signal";

/**
 * Checks that a `SimulationRunner` behaves as the port promises: a run
 * streams every snapshot in order before it resolves, a stop signal ends it
 * with no snapshot after the stop, and an engine failure rejects. Returns the
 * broken rules; an empty list means the runner passed. Every implementation
 * should run this, so code tested against one runner holds for the others.
 *
 * @param request A request that runs for at least two simulated seconds,
 *   so a run can be stopped between snapshots.
 */
export async function checkSimulationRunnerContract(
  runner: SimulationRunner,
  request: SimulationRequest,
): Promise<string[]> {
  const violations: string[] = [];
  const check: RunnerCheck = {
    runner,
    request,
    expect: (ok, rule) => {
      if (!ok) violations.push(rule);
    },
  };
  for (const stage of STAGES) await stage(check);
  return violations;
}

/** What every stage works with. */
interface RunnerCheck {
  readonly runner: SimulationRunner;
  readonly request: SimulationRequest;
  /** Records `rule` as broken unless `ok`. */
  readonly expect: (ok: boolean, rule: string) => void;
}

type RunnerStage = (check: RunnerCheck) => Promise<void>;

const STAGES: readonly RunnerStage[] = [
  checkFinishes,
  checkStoppedBeforeStart,
  checkStoppedMidRun,
  checkFailureRejects,
];

async function checkFinishes({ runner, request, expect }: RunnerCheck) {
  const received: MetricsSnapshot[] = [];
  const { outcome, seenAtResolve } = await runner
    .run({ request, onSnapshot: (s) => received.push(s) })
    .then((settled) => ({ outcome: settled, seenAtResolve: [...received] }));

  expect(outcome.status === "finished", "an unstopped run finishes");
  if (outcome.status !== "finished") return;
  expect(
    outcome.run.snapshots.length >= 2,
    "the request runs for at least two snapshots (a precondition)",
  );
  expect(
    sameData(seenAtResolve, outcome.run.snapshots),
    "every snapshot is streamed, in order, before the run resolves",
  );
}

async function checkStoppedBeforeStart({
  runner,
  request,
  expect,
}: RunnerCheck) {
  const stopSignal = new ManualStopSignal();
  stopSignal.stop();
  let snapshots = 0;

  const outcome = await runner.run({
    request,
    stopSignal,
    onSnapshot: () => (snapshots += 1),
  });

  expect(outcome.status === "stopped", "a run stopped before it starts stops");
  expect(snapshots === 0, "a run stopped before it starts streams nothing");
}

async function checkStoppedMidRun({ runner, request, expect }: RunnerCheck) {
  const stopSignal = new ManualStopSignal();
  let snapshots = 0;

  const outcome = await runner.run({
    request,
    stopSignal,
    onSnapshot: () => {
      snapshots += 1;
      stopSignal.stop();
    },
  });

  expect(outcome.status === "stopped", "a run stopped midway stops");
  expect(snapshots === 1, "no snapshot is streamed after the stop");
}

async function checkFailureRejects({ runner, request, expect }: RunnerCheck) {
  const broken = { ...request, workloadId: "no-such-workload" };

  const failed = await runner.run({ request: broken }).then(
    () => false,
    () => true,
  );

  expect(failed, "an engine failure rejects the run");
}

function sameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
