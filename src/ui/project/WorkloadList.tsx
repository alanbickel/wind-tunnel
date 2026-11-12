import { useMemo } from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { useUseCases } from "../app/useUseCases";
import { dispatchKind } from "../shared/kind-dispatch";
import styles from "./ArchitectureView.module.css";

export interface WorkloadListProps {
  readonly project: Project;
  readonly selection: Selection | undefined;
  readonly onSelect: (selection: Selection) => void;
}

/**
 * "Workloads", and a button for each, in project order, marked current
 * while its workload is selected, and saying how many problems it has, if
 * any; or a line on what a workload is, while there are none (UX design
 * §2.7 step 1).
 */
export function WorkloadList(props: WorkloadListProps) {
  return (
    <>
      <h4 className={styles.listHeading}>Workloads</h4>
      {props.project.workloads.length === 0 ? (
        <p>
          No workloads yet. A workload says how much traffic your workflows get,
          and for how long.
        </p>
      ) : (
        <WorkloadRows {...props} />
      )}
    </>
  );
}

/** The list's rows, one per workload. */
function WorkloadRows({ project, selection, onSelect }: WorkloadListProps) {
  const { checkWorkloads } = useUseCases();
  const checks = useMemo(
    () => checkWorkloads.execute({ project }),
    [checkWorkloads, project],
  );
  const shown = selection && dispatchKind(SHOWN_WORKLOAD, selection);
  return (
    <ul aria-label="Workloads" className={styles.items}>
      {project.workloads.map(({ id, name }) => (
        <li key={id}>
          <WorkloadRow
            name={name}
            problems={checks.get(id)?.problems}
            current={id === shown}
            onSelect={() => {
              onSelect({ kind: "workload", workloadId: id });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

interface WorkloadRowProps {
  readonly name: string;
  /** "1 problem", "2 problems"; undefined for none. */
  readonly problems: string | undefined;
  readonly current: boolean;
  readonly onSelect: () => void;
}

/**
 * A workload's button, with its problem count, if any, after its name in
 * words, so it doesn't rely on color.
 */
function WorkloadRow({ name, problems, current, onSelect }: WorkloadRowProps) {
  return (
    <button
      type="button"
      className={styles.item}
      aria-current={current || undefined}
      onClick={onSelect}
    >
      {name}
      {problems !== undefined && (
        <>
          {" · "}
          <span className={styles.problems}>{problems}</span>
        </>
      )}
    </button>
  );
}

/** The workload Details shows for each kind of selection. */
const SHOWN_WORKLOAD: KindHandlers<Selection, string | undefined> = {
  component: () => undefined,
  edge: () => undefined,
  workflow: () => undefined,
  step: () => undefined,
  workload: ({ workloadId }) => workloadId,
  "new-workflow": () => undefined,
  finding: () => undefined,
};
