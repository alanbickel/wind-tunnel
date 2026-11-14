import { memo, useId } from "react";
import type { Workload } from "../../domain/model/project";
import type { FindingSelecting } from "./finding-selecting";
import { Findings } from "./Findings";
import { RunColumn } from "./RunLines";
import type { RunMeaning } from "./useRunFindings";

/** What the explanation shows of the screen's latest run. */
export interface RunExplanationProps {
  /** What the run means, as of the deferred snapshots. */
  readonly meaning: RunMeaning;
  /** The workload the run ran: its own copy, not the project's. */
  readonly ran: Workload;
  /** Whether the run is of an earlier version of the project. */
  readonly outOfDate: boolean;
  /** Which finding is selected, and how to select one. */
  readonly findingSelecting: FindingSelecting;
}

/**
 * What the latest run means, as the inspector shows it with nothing
 * selected (UX design §9): the out-of-date line when the project has
 * changed since, "Run: <workload>", named from the run's own copy so a
 * rename since doesn't change it, then the verdict, Why, and Try. The
 * evidence, the totals and charts, is the dock's Run overlay's
 * (`RunEvidence`).
 */
export function RunExplanation(props: RunExplanationProps) {
  const { meaning, ran, outOfDate, findingSelecting } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <RunColumn outOfDate={outOfDate}>
        <h3 id={headingId}>Run: {ran.name}</h3>
        <RunFindings meaning={meaning} selecting={findingSelecting} />
      </RunColumn>
    </section>
  );
}

interface RunFindingsProps {
  readonly meaning: RunMeaning;
  readonly selecting: FindingSelecting;
}

/**
 * The verdict, Why, and Try. Memoized, so it draws again only when the
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
