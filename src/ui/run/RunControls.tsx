import { useId } from "react";
import type { Workload } from "../../domain/model/project";

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
 * is marked `aria-disabled` and ignores clicks rather than being disabled,
 * because disabling the focused button would drop the keyboard focus.
 */
export function RunControls(props: RunControlsProps) {
  const { workloads, workload, onPick, running, onStart, onStop } = props;
  const pickerId = useId();

  return (
    <p>
      <label htmlFor={pickerId}>Workload</label>{" "}
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
      </select>{" "}
      <UsableButton usable={!running} onClick={onStart}>
        Run
      </UsableButton>{" "}
      <UsableButton usable={running} onClick={onStop}>
        Stop
      </UsableButton>
    </p>
  );
}

/** Looks unavailable, as a disabled button would; the app has no stylesheet yet. */
const UNUSABLE_STYLE = { opacity: 0.5, cursor: "not-allowed" } as const;

interface UsableButtonProps {
  /** When false, the button says it's unavailable and ignores clicks. */
  readonly usable: boolean;
  readonly onClick: () => void;
  readonly children: string;
}

function UsableButton({ usable, onClick, children }: UsableButtonProps) {
  return (
    <button
      type="button"
      aria-disabled={!usable}
      style={usable ? undefined : UNUSABLE_STYLE}
      onClick={() => {
        if (usable) onClick();
      }}
    >
      {children}
    </button>
  );
}
