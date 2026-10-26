import type { ComponentDetails } from "../../../application/details/details";
import { checkComponentName } from "../../../application/details/name-draft";
import type { DraftCheck } from "../../../application/details/number-draft";
import { renameComponent } from "../../../application/edits/component-edits";
import type { Project } from "../../../domain/model/project";
import type { FieldProps } from "./field-parts";
import { TextField } from "./TextField";
import { useDraft } from "./useDraft";

export interface NameFieldProps extends FieldProps {
  readonly project: Project;
  readonly details: ComponentDetails;
}

/**
 * A component's name. A draft that's empty, or that another component of
 * the type already uses, stays in the field with its message and doesn't
 * save (UX design §5).
 */
export function NameField(props: NameFieldProps) {
  const { project, details, componentId } = props;
  const draft = useDraft(details.name);
  const check = checkComponentName({
    project,
    componentId,
    text: draft.value,
    typeName: details.typeName,
  });
  return (
    <TextField
      label="Name"
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      onCommit={() => {
        commitName({ ...props, check, reset: draft.reset });
      }}
    />
  );
}

interface CommitNameInput extends NameFieldProps {
  readonly check: DraftCheck<string>;
  /** Puts back the saved name. */
  readonly reset: () => void;
}

/**
 * Renames the component if the draft passes; announces its message if
 * not. The same name with spaces around it renames nothing, and shows the
 * name as it was.
 */
function commitName(input: CommitNameInput): void {
  const { check, details, componentId, onEdit, announce, reset } = input;
  if (check.status === "fails") {
    announce(check.message);
    return;
  }
  if (check.value === details.name) {
    reset();
    return;
  }
  onEdit((record) =>
    renameComponent(record, { componentId, name: check.value }),
  );
}
