import type { WorkflowDetails } from "../../../application/details/details";
import type { DraftCheck } from "../../../application/details/number-draft";
import { checkWorkflowName } from "../../../application/details/workflow-name";
import { renameWorkflow } from "../../../application/edits/workflow-edits";
import type { Project } from "../../../domain/model/project";
import type { Edit } from "../useProjectEdits";
import type { FieldProps } from "./field-parts";
import { TextField } from "./TextField";
import { useDraft } from "./useDraft";

export interface WorkflowNameFieldProps {
  readonly project: Project;
  readonly details: WorkflowDetails;
  /** Saves the rename, once the draft passes. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: FieldProps["announce"];
}

/**
 * A workflow's name. A draft that's empty, or that another workflow
 * already uses, stays in the field with its message and doesn't save (UX
 * design §5). The check runs on each render: the other workflows' names
 * are in the project.
 */
export function WorkflowNameField(props: WorkflowNameFieldProps) {
  const { project, details } = props;
  const draft = useDraft(details.name);
  const check = checkWorkflowName({
    project,
    workflowId: details.workflowId,
    text: draft.value,
  });
  return (
    <TextField
      label="Name"
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      onCommit={() => {
        commitWorkflowName({ ...props, check, reset: draft.reset });
      }}
    />
  );
}

interface CommitWorkflowNameInput extends WorkflowNameFieldProps {
  readonly check: DraftCheck<string>;
  /** Puts back the saved name. */
  readonly reset: () => void;
}

/**
 * Renames the workflow if the draft passes; announces its message if not.
 * The same name with spaces around it renames nothing, and shows the name
 * as it was.
 */
function commitWorkflowName(input: CommitWorkflowNameInput): void {
  const { check, details, onEdit, announce, reset } = input;
  if (check.status === "fails") {
    announce(check.message);
    return;
  }
  if (check.value === details.name) {
    reset();
    return;
  }
  const name = check.value;
  onEdit({
    command: (record) =>
      renameWorkflow(record, { workflowId: details.workflowId, name }),
    describe: () => `Rename ${details.name} to ${name}`,
  });
}
