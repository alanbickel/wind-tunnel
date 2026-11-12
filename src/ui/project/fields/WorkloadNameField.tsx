import { useLayoutEffect, useRef } from "react";
import type { WorkloadDetails } from "../../../application/details/details";
import type { DraftCheck } from "../../../application/details/number-draft";
import { checkWorkloadName } from "../../../application/details/workload-name";
import { renameWorkload } from "../../../application/edits/workload-edits";
import type { Project } from "../../../domain/model/project";
import type { Edit } from "../useProjectEdits";
import type { ProjectSelection } from "../useSelection";
import type { FieldProps } from "./field-parts";
import { TextField } from "./TextField";
import { useDraft } from "./useDraft";

export interface WorkloadNameFieldProps {
  readonly project: Project;
  readonly details: WorkloadDetails;
  /** Saves the rename, once the draft passes. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: FieldProps["announce"];
  /** Whether to take the focus, with the name selected: just after an add. */
  readonly takeFocus: ProjectSelection["takeFocus"];
}

/**
 * A workload's name. A draft that's empty, or that another workload
 * already uses, stays in the field with its message and doesn't save (UX
 * design §5). The check runs on each render: the other workloads' names
 * are in the project. Takes the focus with its text selected when
 * `takeFocus` says so, so a new workload can be named by typing.
 */
export function WorkloadNameField(props: WorkloadNameFieldProps) {
  const { project, details, takeFocus } = props;
  const draft = useDraft(details.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // A layout effect, as Details' heading takes the focus.
  useLayoutEffect(() => {
    if (!takeFocus("name")) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [takeFocus]);
  const check = checkWorkloadName({
    project,
    workloadId: details.workloadId,
    text: draft.value,
  });
  return (
    <TextField
      label="Name"
      inputRef={inputRef}
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      onCommit={() => {
        commitWorkloadName({ ...props, check, reset: draft.reset });
      }}
    />
  );
}

interface CommitWorkloadNameInput extends WorkloadNameFieldProps {
  readonly check: DraftCheck<string>;
  /** Puts back the saved name. */
  readonly reset: () => void;
}

/**
 * Renames the workload if the draft passes; announces its message if not.
 * The same name with spaces around it renames nothing, and shows the name
 * as it was.
 */
function commitWorkloadName(input: CommitWorkloadNameInput): void {
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
      renameWorkload(record, { workloadId: details.workloadId, name }),
    describe: () => `Rename ${details.name} to ${name}`,
  });
}
