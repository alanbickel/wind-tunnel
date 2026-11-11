import { useId, useMemo, type RefObject } from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { dispatchKind } from "../shared/kind-dispatch";
import styles from "./ArchitectureView.module.css";

export interface WorkflowListProps {
  readonly project: Project;
  readonly selection: Selection | undefined;
  readonly onSelect: (selection: Selection) => void;
  /** "Add workflow". */
  readonly adding: AddWorkflowProps;
}

export interface AddWorkflowProps {
  /** Starts a new workflow. */
  readonly onAdd: () => void;
  /** The "Add workflow" button, where the focus goes after a workflow's remove. */
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  /**
   * What a workflow's remove announces: "Removed Get order." Said by the
   * canvas's panel buttons, not in the list, whose panel may be hidden.
   */
  readonly announcement: string;
}

/**
 * "Workflows", and a button for each, in project order, marked current
 * while its workflow, or a step in it, is selected, and saying how many
 * problems it has, if any; or a line on what a workflow is, while there
 * are none (UX design §2.5 step 1).
 */
export function WorkflowList(props: WorkflowListProps) {
  return (
    <>
      <div className={styles.listHeader}>
        <h4 className={styles.listHeading}>Workflows</h4>
        <AddWorkflow {...props} />
      </div>
      {props.project.workflows.length === 0 ? (
        <p>
          No workflows yet. A workflow is the path one kind of request takes
          through your architecture.
        </p>
      ) : (
        <WorkflowRows {...props} />
      )}
    </>
  );
}

/** The list's rows, one per workflow. */
function WorkflowRows({ project, selection, onSelect }: WorkflowListProps) {
  const { checkWorkflows } = useUseCases();
  const checks = useMemo(
    () => checkWorkflows.execute({ project }),
    [checkWorkflows, project],
  );
  const shown = selection && dispatchKind(SHOWN_WORKFLOW, selection);
  return (
    <ul aria-label="Workflows" className={styles.items}>
      {project.workflows.map(({ id, name }) => (
        <li key={id}>
          <WorkflowRow
            name={name}
            problems={checks.get(id)?.problems}
            current={id === shown}
            onSelect={() => {
              onSelect({ kind: "workflow", workflowId: id });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

interface WorkflowRowProps {
  readonly name: string;
  /** "1 problem", "2 problems"; undefined for none. */
  readonly problems: string | undefined;
  readonly current: boolean;
  readonly onSelect: () => void;
}

/**
 * A workflow's button, with its problem count, if any, after its name in
 * words, so it doesn't rely on color.
 */
function WorkflowRow({ name, problems, current, onSelect }: WorkflowRowProps) {
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

/** The workflow whose outline Details shows for each kind of selection. */
const SHOWN_WORKFLOW: KindHandlers<Selection, string | undefined> = {
  component: () => undefined,
  edge: () => undefined,
  workflow: ({ workflowId }) => workflowId,
  step: ({ workflowId }) => workflowId,
  "new-workflow": () => undefined,
};

/** What "Add workflow" says while the project has no component to call. */
const ADD_A_COMPONENT_FIRST = "Add a component first.";

/**
 * "Add workflow", which opens a new workflow in Details as a draft. A
 * workflow's first step calls a component, so with none the button is
 * unusable, and says why in words its description points at.
 */
function AddWorkflow({ project, adding }: WorkflowListProps) {
  const { onAdd, buttonRef } = adding;
  const whyId = useId();
  const usable = project.architecture.components.length > 0;
  return (
    <>
      <Button
        ref={buttonRef}
        usable={usable}
        describedBy={usable ? undefined : whyId}
        onClick={onAdd}
      >
        Add workflow
      </Button>
      {!usable && (
        <p id={whyId} className={styles.whyNot}>
          {ADD_A_COMPONENT_FIRST}
        </p>
      )}
    </>
  );
}
