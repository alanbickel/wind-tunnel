import { useMemo } from "react";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Issues } from "./WorkloadParts";

export interface WorkloadProblemsProps {
  readonly project: Project;
  readonly workloadId: string;
}

/**
 * What stops the workload's runs, as sentences, the run group's reasons
 * (its own, and those of the workflows in its mix), or that nothing does;
 * then where its traffic is edited. The inspector shows it under the
 * workload's name (UX design §5).
 */
export function WorkloadProblems({
  project,
  workloadId,
}: WorkloadProblemsProps) {
  const { checkWorkloads } = useUseCases();
  const reasons = useMemo(
    () => checkWorkloads.execute({ project }).get(workloadId)?.reasons ?? [],
    [checkWorkloads, project, workloadId],
  );
  const where = "Its traffic is edited in the Workloads tab.";
  if (reasons.length === 0) return <p>No problems: it can run. {where}</p>;
  return (
    <>
      <p>It can&rsquo;t run yet:</p>
      <Issues messages={reasons} />
      <p>{where}</p>
    </>
  );
}
