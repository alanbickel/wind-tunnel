import {
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  ComponentDetails,
  Details,
  EdgeDetails,
  SettingDetails,
} from "../../application/details/details";
import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { dispatchKind } from "../shared/kind-dispatch";
import styles from "./SelectionDetails.module.css";

export interface SelectionDetailsProps {
  readonly project: Project;
  readonly selection: Selection;
  /** Clears the selection and returns the focus: on Escape, and on Close. */
  readonly onClose: () => void;
  /** Shows a Close button beside the heading, as the narrow layout does. */
  readonly closable?: boolean;
}

/**
 * The selected component's or edge's settings, read-only, each with its
 * help and default, and what calls it (UX design §4.1). Takes the focus to
 * its heading whenever the selection changes, so the keyboard and a screen
 * reader land on it. Escape anywhere in it closes it.
 */
export function SelectionDetails(props: SelectionDetailsProps) {
  const { project, selection, onClose, closable = false } = props;
  const { describeSelection } = useUseCases();
  const details = useMemo(
    () => describeSelection.execute({ project, selection }),
    [describeSelection, project, selection],
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A layout effect, so the focus moves in the commit that shows Details.
  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, [selection]);

  if (details === undefined) return <NothingSelected />;
  return (
    <div
      className={styles.details}
      onKeyDown={(event) => {
        closeOnEscape(event, onClose);
      }}
    >
      <div className={styles.header}>
        <h4 ref={headingRef} tabIndex={-1} className={styles.heading}>
          {dispatchKind(HEADINGS, details)}
        </h4>
        {closable && <Button onClick={onClose}>Close</Button>}
      </div>
      <Settings settings={details.settings} />
      <p className={styles.callers}>{dispatchKind(CALLERS, details)}</p>
    </div>
  );
}

/** What the Details tab says while nothing is selected. */
export function NothingSelected() {
  return (
    <p className={styles.empty}>
      Nothing selected. Select a component or a connection, on the diagram or in
      its text version, to see its settings.
    </p>
  );
}

function closeOnEscape(
  event: KeyboardEvent<HTMLElement>,
  onClose: () => void,
): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  onClose();
}

/** The heading: what's selected, then what kind of thing it is. */
const HEADINGS: KindHandlers<Details, ReactNode> = {
  component: ({ name, typeName }: ComponentDetails) => (
    <>
      {name}
      <span className={styles.kind}> · {typeName}</span>
    </>
  ),
  edge: ({ sourceName, targetName }: EdgeDetails) => (
    <>
      {sourceName} → {targetName}
      <span className={styles.kind}> · Connection</span>
    </>
  ),
};

/** What calls the component, or along the edge, or that nothing does yet. */
const CALLERS: KindHandlers<Details, string> = {
  component: ({ calledBy }: ComponentDetails) =>
    `Called by: ${listOr(
      calledBy,
      "nothing yet. A component does nothing until a workflow step calls it.",
    )}`,
  edge: ({ calledAlongBy }: EdgeDetails) =>
    `Called along by: ${listOr(
      calledAlongBy.map((call) => `${call.workflowName} (${call.action})`),
      "nothing yet. A connection carries nothing until a workflow step calls along it.",
    )}`,
};

/** The items, joined with commas, or `none` if there are none. */
function listOr(items: readonly string[], none: string): string {
  return items.length === 0 ? none : items.join(", ");
}

interface SettingsProps {
  readonly settings: readonly SettingDetails[];
}

/** Each setting: its label, its value with the unit, then its help. */
function Settings({ settings }: SettingsProps) {
  return (
    <dl className={styles.settings}>
      {settings.map((setting) => (
        <div key={setting.key} className={styles.setting}>
          <dt className={styles.label}>{setting.label}</dt>
          <dd className={styles.value}>{setting.value}</dd>
          <dd className={styles.help}>
            {[setting.help, setting.defaultNote].filter(Boolean).join(" ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
