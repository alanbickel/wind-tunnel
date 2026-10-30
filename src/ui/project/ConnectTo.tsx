import { useId, useState } from "react";
import type { ComponentDetails } from "../../application/details/details";
import type { Project } from "../../domain/model/project";
import { Button } from "../shared/Button";
import fieldStyles from "./fields/Fields.module.css";
import styles from "./SelectionDetails.module.css";
import type { Connect } from "./useConnect";

export interface ConnectToProps {
  readonly project: Project;
  readonly details: ComponentDetails;
  readonly connect: Connect;
  /** Says what was connected, without moving the focus. */
  readonly announce: (message: string) => void;
}

/**
 * "Connect to…", the keyboard's way to draw an edge from the component
 * (UX design §2.1 step 5): a picker of the components it has no edge to
 * yet, itself excluded, and Connect. The edge saves with its caller
 * type's defaults, the picker loses the component it now reaches, and the
 * focus stays on Connect, so the next can follow.
 */
export function ConnectTo({
  project,
  details,
  connect,
  announce,
}: ConnectToProps) {
  const id = useId();
  const { connectTargets } = details;
  const [picked, pick] = useState<string>();
  const target =
    connectTargets.find((t) => t.componentId === picked) ?? connectTargets[0];
  if (target === undefined) {
    return (
      <p className={styles.connect}>
        Connected to every other component already.
      </p>
    );
  }
  return (
    <div className={`${styles.connect} ${fieldStyles.field}`}>
      <label htmlFor={id} className={fieldStyles.label}>
        Connect to
      </label>
      <select
        id={id}
        value={target.componentId}
        onChange={(event) => {
          pick(event.target.value);
        }}
      >
        {connectTargets.map(({ componentId, label }) => (
          <option key={componentId} value={componentId}>
            {label}
          </option>
        ))}
      </select>
      <Button
        onClick={() => {
          const from = details.componentId;
          const said = connect({ project, from, to: target.componentId });
          if (said !== undefined) announce(said);
        }}
      >
        Connect
      </Button>
    </div>
  );
}
