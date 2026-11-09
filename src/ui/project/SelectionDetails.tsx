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
  RemovalText,
  WorkflowDetails,
} from "../../application/details/details";
import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { dispatchKind } from "../shared/kind-dispatch";
import { useAnnouncement } from "../shared/useAnnouncement";
import { ConnectTo } from "./ConnectTo";
import { ComponentSettings } from "./fields/ComponentSettings";
import { EdgeSettings } from "./fields/EdgeSettings";
import { WorkflowNameField } from "./fields/WorkflowNameField";
import { NewWorkflowDetails } from "./NewWorkflowDetails";
import { RemoveConfirmation } from "./RemoveConfirmation";
import { useConfirming } from "./useConfirming";
import styles from "./SelectionDetails.module.css";
import { useConnect, type Connect } from "./useConnect";
import type { Edit } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";
import { WorkflowOutline } from "./WorkflowOutline";

export interface SelectionDetailsProps {
  readonly project: Project;
  readonly selection: Selection;
  /** Saves a change made in Details. */
  readonly onEdit: (edit: Edit) => void;
  /** Clears the selection and returns the focus: on Escape, and on Close. */
  readonly onClose: () => void;
  /** Removes the selected component, edge, or workflow, once the user confirms it. */
  readonly onRemove: (target: Selection) => void;
  /** Selects something Details shows: a step in a workflow's outline. */
  readonly onSelect: (selection: Selection) => void;
  /** Whether a part of Details should take the focus: just after a selection. */
  readonly takeFocus: ProjectSelection["takeFocus"];
  /** Shows a Close button beside the heading, as the narrow layout does. */
  readonly closable?: boolean;
}

/**
 * The selected component's or edge's settings, each a field that saves a
 * change once it passes its checks, and a component's "Connect to…"; then
 * what calls it (UX design §4.1, §4.3). Or the selected workflow's name field
 * and outline, with the selected step marked in it. Takes the focus to its
 * heading when `takeFocus` says a selection was just made, so the keyboard and
 * a screen reader land on it. Escape anywhere in it closes it, unless a field
 * has a draft to put back first. Remove asks before it removes.
 */
export function SelectionDetails(props: SelectionDetailsProps) {
  if (props.selection.kind === "new-workflow") {
    return <NewWorkflowFrame {...props} />;
  }
  return <DescribedSelection {...props} />;
}

/** A component, an edge, a workflow, or a step: what `describeSelection` says. */
function DescribedSelection(props: SelectionDetailsProps) {
  const { project, selection, onClose } = props;
  const { describeSelection } = useUseCases();
  const details = useMemo(
    () => describeSelection.execute({ project, selection }),
    [describeSelection, project, selection],
  );
  const [announcement, announce] = useAnnouncement();

  if (details === undefined) return <NothingSelected />;
  const callers = dispatchKind(CALLERS, details);
  return (
    <div
      className={styles.details}
      onKeyDown={(event) => {
        closeOnEscape(event, onClose);
      }}
    >
      {/* Keyed by the selection, so a confirmation doesn't carry over. */}
      <DetailsHeader key={keyOf(selection)} {...props} details={details} />
      <DetailsBody {...props} details={details} announce={announce} />
      {callers !== undefined && <p className={styles.callers}>{callers}</p>}
      {/* On the page from the start, empty, so a screen reader announces
          a message put in it (UX design §4.4). */}
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </div>
  );
}

/**
 * A new workflow's draft, with the Escape that closes Details. It has no
 * details to describe, Remove, or call it: nothing is stored yet.
 */
function NewWorkflowFrame(props: SelectionDetailsProps) {
  const { project, onEdit, onSelect, takeFocus, onClose } = props;
  return (
    <div
      className={styles.details}
      onKeyDown={(event) => {
        closeOnEscape(event, onClose);
      }}
    >
      <NewWorkflowDetails
        project={project}
        onEdit={onEdit}
        onSelect={onSelect}
        takeFocus={takeFocus}
      />
    </div>
  );
}

/** One key per thing that can be selected. */
function keyOf(selection: Selection): string {
  return JSON.stringify(selection);
}

/** What the Details tab says while nothing is selected. */
export function NothingSelected() {
  return (
    <p className={styles.empty}>
      Nothing selected. Select a component or a connection, on the diagram or in
      its text version, to see its settings, or a workflow to see its steps.
    </p>
  );
}

interface DetailsHeaderProps extends SelectionDetailsProps {
  readonly details: Details;
}

/**
 * The heading, Remove, and Close, if there is one. Remove opens a confirmation under them, and Cancel there
 * returns the focus to Remove.
 */
function DetailsHeader(props: DetailsHeaderProps) {
  const { details, onRemove, onClose, closable = false } = props;
  const removal = dispatchKind(REMOVALS, details);
  const openerRef = useRef<HTMLButtonElement>(null);
  const { open, ask, cancel } = useConfirming(openerRef);
  return (
    <>
      <div className={styles.header}>
        <Heading {...props} />
        <div className={styles.actions}>
          {!open && (
            <Button ref={openerRef} onClick={ask}>
              Remove
            </Button>
          )}
          {closable && <Button onClick={onClose}>Close</Button>}
        </div>
      </div>
      {open && (
        <RemoveConfirmation
          text={removal.text}
          onConfirm={() => {
            onRemove(removal.target);
          }}
          onCancel={cancel}
        />
      )}
    </>
  );
}

/** What's selected, and what kind it is; takes the focus after a selection. */
function Heading({ details, selection, takeFocus }: DetailsHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A layout effect, so the focus moves in the commit that shows Details.
  useLayoutEffect(() => {
    if (takeFocus("heading")) headingRef.current?.focus();
  }, [selection, takeFocus]);
  return (
    <h4 ref={headingRef} tabIndex={-1} className={styles.heading}>
      {dispatchKind(HEADINGS, details)}
    </h4>
  );
}

/** What a remove would take, and what it removes. */
interface Removal {
  readonly text: RemovalText;
  readonly target: Selection;
}

/** Each kind's remove. */
const REMOVALS: KindHandlers<Details, Removal> = {
  component: ({ componentId, removal }: ComponentDetails) => ({
    text: removal,
    target: { kind: "component", componentId },
  }),
  edge: ({ edgeId, removal }: EdgeDetails) => ({
    text: removal,
    target: { kind: "edge", edgeId },
  }),
  workflow: ({ workflowId, removal }: WorkflowDetails) => ({
    text: removal,
    target: { kind: "workflow", workflowId },
  }),
};

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
  workflow: ({ name }: WorkflowDetails) => (
    <>
      {name}
      <span className={styles.kind}> · Workflow</span>
    </>
  ),
};

/**
 * What a body needs beyond the details: the project, how to save,
 * connect, select, and announce, and whether its name field takes the
 * focus.
 */
interface BodyContext {
  readonly project: Project;
  readonly onEdit: (edit: Edit) => void;
  readonly onSelect: (selection: Selection) => void;
  readonly announce: (message: string) => void;
  readonly takeFocus: ProjectSelection["takeFocus"];
  readonly connect: Connect;
}

interface DetailsBodyProps extends SelectionDetailsProps {
  readonly details: Details;
  readonly announce: (message: string) => void;
}

/** What's selected, as its kind's body shows it; connects through `onEdit`. */
function DetailsBody(props: DetailsBodyProps) {
  const { details, project, onEdit, onSelect, announce, takeFocus } = props;
  const connect = useConnect(onEdit);
  const context = { project, onEdit, onSelect, announce, takeFocus, connect };
  return dispatchKind(BODIES, details)(context);
}

/**
 * A component's settings, then "Connect to…"; an edge's settings; a
 * workflow's name, then its outline. Each is keyed by what's selected, so no
 * draft carries over to the next one.
 */
const BODIES: KindHandlers<Details, (context: BodyContext) => ReactNode> = {
  component: (details: ComponentDetails) => (context) => (
    <div key={details.componentId}>
      <ComponentSettings details={details} {...context} />
      <ConnectTo details={details} {...context} />
    </div>
  ),
  edge: (details: EdgeDetails) => (context) => (
    <EdgeSettings key={details.edgeId} details={details} {...context} />
  ),
  workflow: (details: WorkflowDetails) => (context) => (
    <div key={details.workflowId}>
      <WorkflowNameField details={details} {...context} />
      <WorkflowOutline details={details} onSelect={context.onSelect} />
    </div>
  ),
};

/**
 * What calls the component, or along the edge, or that nothing does yet;
 * undefined for a workflow, whose outline says what uses it.
 */
const CALLERS: KindHandlers<Details, string | undefined> = {
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
  workflow: () => undefined,
};

/** The items, joined with commas, or `none` if there are none. */
function listOr(items: readonly string[], none: string): string {
  return items.length === 0 ? none : items.join(", ");
}
