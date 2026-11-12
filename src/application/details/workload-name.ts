import type { Project } from "../../domain/model/project";
import type { DraftCheck } from "./number-draft";
import { nameKey } from "./project-name";

/** A workload's name field: what's typed, and where the workload is. */
export interface WorkloadNameInput {
  readonly project: Project;
  /** The workload being named, whose own name doesn't count against it. */
  readonly workloadId: string;
  /** What's typed. Spaces around it are dropped. */
  readonly text: string;
}

/** What a workload's name field says when it's empty. */
export const WORKLOAD_NAME_EMPTY = "A workload needs a name.";

/** What a workload's name field says when another workload uses the name. */
export const WORKLOAD_NAME_TAKEN =
  "Another workload already uses this name. Please choose another name.";

/**
 * A workload's new name, checked: not empty, and not used by another
 * workload of the project (UX design §2.7, §5). Names are compared without
 * the spaces around them and ignoring case, as workflow names are, so
 * "lunch rush" can become "Lunch rush". Workloads already stored with the
 * same name keep it.
 */
export function checkWorkloadName({
  project,
  workloadId,
  text,
}: WorkloadNameInput): DraftCheck<string> {
  const name = text.trim();
  if (name === "") return { status: "fails", message: WORKLOAD_NAME_EMPTY };
  const key = nameKey(name);
  const taken = project.workloads.some(
    (w) => w.id !== workloadId && nameKey(w.name) === key,
  );
  if (!taken) return { status: "passes", value: name };
  return { status: "fails", message: WORKLOAD_NAME_TAKEN };
}
