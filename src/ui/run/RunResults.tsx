import { memo } from "react";
import type { FindingSelecting } from "./finding-selecting";
import { Findings } from "./Findings";
import { NothingRunYet, RunColumn } from "./RunLines";
import type { RunMeaning } from "./useRunFindings";
import type { ProjectRun } from "./useProjectRun";

/**
 * What the results show of the screen's run: what it means, as of the
 * deferred snapshots, and whether the project has changed since it started.
 * A `ProjectRun` can be spread in.
 */
export interface RunResultsProps extends Pick<
  ProjectRun,
  "meaning" | "outOfDate"
> {
  /** Which finding is selected, and how to select one. */
  readonly findingSelecting: FindingSelecting;
}

/**
 * What the latest run means: its verdict and findings; a line saying so
 * before the first run. A run of an earlier version of the project opens
 * with a line saying so, and reads as it was. The evidence, the totals and
 * charts, is the dock's Run overlay's (`RunEvidence`).
 */
export function RunResults(props: RunResultsProps) {
  const { meaning, outOfDate, findingSelecting } = props;
  if (meaning === undefined) return <NothingRunYet />;
  return (
    <RunColumn outOfDate={outOfDate}>
      <RunFindings meaning={meaning} selecting={findingSelecting} />
    </RunColumn>
  );
}

interface RunFindingsProps {
  readonly meaning: RunMeaning;
  readonly selecting: FindingSelecting;
}

/**
 * The verdict and findings. Memoized, so it draws again only when the
 * deferred snapshots change, not on every snapshot that the project
 * screen sees.
 */
const RunFindings = memo(function RunFindings({
  meaning: { findings, wording },
  selecting,
}: RunFindingsProps) {
  return (
    <Findings findings={findings} wording={wording} selecting={selecting} />
  );
});
