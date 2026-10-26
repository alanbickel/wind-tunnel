import { Panel } from "../shared/Panel";
import { RunResults, type RunResultsProps } from "./RunResults";

/** What the panel shows: the run's results, as the Run tab shows them. */
export type RunPanelProps = RunResultsProps;

/**
 * The latest run's results in a panel of their own, for a narrow window,
 * where they follow the model. A wide window shows them in the Run tab.
 */
export function RunPanel(props: RunPanelProps) {
  return (
    <Panel heading="Run" scrolls>
      <RunResults {...props} />
    </Panel>
  );
}
