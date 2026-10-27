import { useId } from "react";
import type { WorkloadRunChecks } from "../../application/run-checks/workload-run-checks";
import type { Workload } from "../../domain/model/project";
import { Button } from "../shared/Button";
import styles from "./RunControls.module.css";

export interface RunControlsProps {
  readonly workloads: readonly Workload[];
  readonly workload: Workload;
  readonly onPick: (workload: Workload) => void;
  /** Which workloads can run; one that can't is marked, and Run waits. */
  readonly checks: WorkloadRunChecks;
  /** True while a run is going: the picker and Run wait, Stop works. */
  readonly running: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/**
 * Picks a workload, then runs or stops it. Run and Stop are separate, so a
 * late click on Stop can't start the next run. The one that can't be used
 * is marked unusable (see `Button`) rather than disabled, so the keyboard
 * focus stays on it. A workload with run issues is marked in the picker,
 * and Run is unusable while it's picked; the project bar says why.
 */
export function RunControls(props: RunControlsProps) {
  const { workloads, workload, onPick, checks, running, onStart, onStop } =
    props;

  return (
    <div className={styles.controls}>
      <WorkloadPicker
        workloads={workloads}
        workload={workload}
        onPick={onPick}
        checks={checks}
        running={running}
      />
      <Button
        variant="primary"
        usable={!running && canRunIn(checks)(workload)}
        onClick={onStart}
      >
        Run
      </Button>
      <Button usable={running} onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

type WorkloadPickerProps = Pick<
  RunControlsProps,
  "workloads" | "workload" | "onPick" | "checks" | "running"
>;

/**
 * The workload picker and its label; it waits while a run is going. A
 * workload that can't run says so in its option.
 */
function WorkloadPicker(props: WorkloadPickerProps) {
  const { workloads, workload, onPick, checks, running } = props;
  const pickerId = useId();
  const canRun = canRunIn(checks);
  return (
    <>
      <label htmlFor={pickerId}>Workload</label>
      <select
        id={pickerId}
        value={workload.id}
        disabled={running}
        onChange={(event) => {
          const picked = workloads.find((w) => w.id === event.target.value);
          if (picked) onPick(picked);
        }}
      >
        {workloads.map((w) => (
          <option key={w.id} value={w.id}>
            {canRun(w) ? w.name : `${w.name} (can't run yet)`}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * Whether a workload can run, by its check. `checks` has one for every
 * workload in the project; a workload without one, can.
 */
function canRunIn(checks: WorkloadRunChecks): (workload: Workload) => boolean {
  return (workload) => checks.get(workload.id)?.canRun ?? true;
}
