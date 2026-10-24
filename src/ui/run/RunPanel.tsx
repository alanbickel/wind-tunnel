import { Panel } from "../shared/Panel";
import { RunResults } from "./RunResults";
import type { RunMeaning } from "./useRunFindings";

export interface RunPanelProps {
  /** The run as of the deferred snapshots, and what it means. */
  readonly meaning: RunMeaning | undefined;
}

/**
 * The latest run's results in a panel of their own, for a narrow window,
 * where they follow the model. A wide window shows them in the Run tab.
 */
export function RunPanel({ meaning }: RunPanelProps) {
  return (
    <Panel heading="Run" scrolls>
      <RunResults meaning={meaning} />
    </Panel>
  );
}
