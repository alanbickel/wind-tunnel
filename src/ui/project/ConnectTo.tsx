import { useCallback, useId, useRef, useState } from "react";
import type {
  ComponentDetails,
  ConnectTarget,
} from "../../application/details/details";
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
 * focus stays on Connect, so the next can follow. Connecting the last one
 * takes Connect away, so the focus moves to the line that replaces it.
 */
export function ConnectTo(props: ConnectToProps) {
  const { connectTargets } = props.details;
  const [picked, pick] = useState<string>();
  const connectedLast = useRef(false);
  const focusIfConnectedLast = useCallback((line: HTMLElement | null) => {
    if (line === null || !connectedLast.current) return;
    connectedLast.current = false;
    line.focus();
  }, []);
  const target =
    connectTargets.find((t) => t.componentId === picked) ?? connectTargets[0];
  return (
    <div className={styles.connect}>
      {target === undefined ? (
        <p ref={focusIfConnectedLast} tabIndex={-1}>
          Connected to every other component already.
        </p>
      ) : (
        <ConnectPicker
          {...props}
          target={target}
          onPick={pick}
          onConnectedLast={() => {
            connectedLast.current = true;
          }}
        />
      )}
    </div>
  );
}

interface ConnectPickerProps extends ConnectToProps {
  /** The component picked, or the first if none is. */
  readonly target: ConnectTarget;
  readonly onPick: (componentId: string) => void;
  /** Called when Connect connects the last component it could. */
  readonly onConnectedLast: () => void;
}

/** The picker of components to connect to, and Connect. */
function ConnectPicker(props: ConnectPickerProps) {
  const { project, details, connect, announce, target } = props;
  const { onPick, onConnectedLast } = props;
  const id = useId();
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        Connect to
      </label>
      <TargetSelect
        id={id}
        targets={details.connectTargets}
        target={target}
        onPick={onPick}
      />
      <Button
        onClick={() => {
          const from = details.componentId;
          const said = connect({ project, from, to: target.componentId });
          if (said === undefined) return;
          announce(said);
          if (details.connectTargets.length === 1) onConnectedLast();
        }}
      >
        Connect
      </Button>
    </div>
  );
}

interface TargetSelectProps {
  readonly id: string;
  readonly targets: readonly ConnectTarget[];
  readonly target: ConnectTarget;
  readonly onPick: (componentId: string) => void;
}

/** One option per component to connect to, by its name and type. */
function TargetSelect({ id, targets, target, onPick }: TargetSelectProps) {
  return (
    <select
      id={id}
      value={target.componentId}
      onChange={(event) => {
        onPick(event.target.value);
      }}
    >
      {targets.map(({ componentId, label }) => (
        <option key={componentId} value={componentId}>
          {label}
        </option>
      ))}
    </select>
  );
}
