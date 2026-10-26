import type { Project } from "../../domain/model/project";
import type { DraftCheck } from "./number-draft";

/** A component's name field: what's typed, and where the component is. */
export interface NameDraftInput {
  readonly project: Project;
  readonly componentId: string;
  /** What's typed. Spaces around it are dropped. */
  readonly text: string;
  /** The type's display name, for the message, e.g. "RDS". */
  readonly typeName: string;
}

/**
 * A component's new name, checked: not empty, and not used by another
 * component of its type, which `validateComponents` also refuses (UX
 * design §5). A Lambda and a DynamoDB table may both be "orders".
 */
export function checkComponentName({
  project,
  componentId,
  text,
  typeName,
}: NameDraftInput): DraftCheck<string> {
  const name = text.trim();
  if (name === "") {
    return { status: "fails", message: "A component needs a name." };
  }
  const { components } = project.architecture;
  const type = components.find((c) => c.id === componentId)?.type;
  const taken = components.some(
    (c) => c.id !== componentId && c.type === type && c.name === name,
  );
  if (!taken) return { status: "passes", value: name };
  return {
    status: "fails",
    message: `Another ${typeName} component already uses this name. Please choose another name.`,
  };
}
