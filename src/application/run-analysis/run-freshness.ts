import type { Project, Workload } from "../../domain/model/project";
import { sameContent } from "./same-content";

/** A run's copy of the project, and the project as it is now. */
export interface RunIsCurrentInput {
  /** The project as it was when the run started. */
  readonly ran: Project;
  /** The ID of the workload the run ran, one of `ran.workloads`. */
  readonly workloadId: Workload["id"];
  /** The project as it is now. */
  readonly project: Project;
}

/** Whether one field of the project is unchanged in a way that matters to the run. */
type FieldUnchanged = (input: RunIsCurrentInput) => boolean;

/** A field that doesn't change a run's results, whatever it holds. */
const DOES_NOT_COUNT: FieldUnchanged = () => true;

/**
 * Every field of a project, and whether a change to it makes a run out of
 * date (ADR-0018). Typed by `Project`'s keys, so a field added to the model
 * doesn't compile until it's placed here, on one side or the other.
 */
const FIELDS: Readonly<Record<keyof Project, FieldUnchanged>> = {
  // Changing these changes no results.
  id: DOES_NOT_COUNT,
  name: DOES_NOT_COUNT,
  description: DOES_NOT_COUNT,
  // What ran. A component's name is part of the architecture, so a rename
  // counts, even though it changes no number (ADR-0018 consequences).
  architecture: ({ ran, project }) =>
    sameContent(ran.architecture, project.architecture),
  workflows: ({ ran, project }) =>
    sameContent(ran.workflows, project.workflows),
  // Only the workload that ran; the others don't change its results.
  workloads: ({ ran, project, workloadId }) =>
    sameContent(workloadIn(ran, workloadId), workloadIn(project, workloadId)),
};

/**
 * Whether a run still shows the project: true while everything that made
 * its results is the same as when it started, compared by content. There's
 * no revision number, so a project that changes and changes back makes the
 * run current again. The layout isn't part of a `Project`, so moving a node
 * never counts either.
 */
export function runIsCurrent(input: RunIsCurrentInput): boolean {
  return Object.values(FIELDS).every((unchanged) => unchanged(input));
}

function workloadIn(
  project: Project,
  workloadId: Workload["id"],
): Workload | undefined {
  return project.workloads.find((workload) => workload.id === workloadId);
}
