import { useId } from "react";
import type { Workload } from "../../domain/model/project";
import { Button } from "../shared/Button";
import styles from "./RunControls.module.css";

export interface RunControlsProps {
  readonly workloads: readonly Workload[];
  readonly workload: Workload;
  readonly onPick: (workload: Workload) => void;
  /** True while a run is going: the picker and Run wait, Stop works. */
  readonly running: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/**
 * Picks a workload, then runs or stops it. Run and Stop are separate, so a
 * late click on Stop can't start the next run. The one that can't be used
 * is marked unusable (see `Button`) rather than disabled, so the keyboard
 * focus stays on it.
 */
export function RunControls(props: RunControlsProps) {
  const { running, onStart, onStop } = props;

  return (
    <div className={styles.controls}>
      <WorkloadPicker {...props} />
      <Button variant="primary" usable={!running} onClick={onStart}>
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
  "workloads" | "workload" | "onPick" | "running"
>;

/** The workload picker and its label; it waits while a run is going. */
function WorkloadPicker(props: WorkloadPickerProps) {
  const { workloads, workload, onPick, running } = props;
  const pickerId = useId();
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
            {w.name}
          </option>
        ))}
      </select>
    </>
  );
}
