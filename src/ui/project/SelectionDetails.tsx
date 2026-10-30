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
  SettingDetails,
} from "../../application/details/details";
import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { dispatchKind } from "../shared/kind-dispatch";
import { useAnnouncement } from "../shared/useAnnouncement";
import { ComponentSettings } from "./fields/ComponentSettings";
import { RemoveConfirmation } from "./RemoveConfirmation";
import { useConfirming } from "./useConfirming";
import styles from "./SelectionDetails.module.css";
import type { EditCommand } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

export interface SelectionDetailsProps {
  readonly project: Project;
  readonly selection: Selection;
  /** Saves a change made in Details. */
  readonly onEdit: (command: EditCommand) => void;
  /** Clears the selection and returns the focus: on Escape, and on Close. */
  readonly onClose: () => void;
  /** Removes the selected component, once the user confirms it. */
  readonly onRemove: (componentId: string) => void;
  /** Whether a part of Details should take the focus: just after a selection. */
  readonly takeFocus: ProjectSelection["takeFocus"];
  /** Shows a Close button beside the heading, as the narrow layout does. */
  readonly closable?: boolean;
}

/**
 * The selected component's settings, each a field that saves a change
 * once it passes its checks, or the selected edge's, read-only; then what
 * calls it (UX design §4.1, §4.3). Takes the focus to its heading when
 * `takeFocus` says a selection was just made, so the keyboard and a screen
 * reader land on it. Escape anywhere in it closes it, unless a field has
 * a draft to put back first. A component's Remove asks before it removes.
 */
export function SelectionDetails(props: SelectionDetailsProps) {
  const { project, selection, onEdit, onClose, takeFocus } = props;
  const { describeSelection } = useUseCases();
  const details = useMemo(
    () => describeSelection.execute({ project, selection }),
    [describeSelection, project, selection],
  );
  const [announcement, announce] = useAnnouncement();

  if (details === undefined) return <NothingSelected />;
  return (
    <div
      className={styles.details}
      onKeyDown={(event) => {
        closeOnEscape(event, onClose);
      }}
    >
      {/* Keyed by the selection, so a confirmation doesn't carry over. */}
      <DetailsHeader key={keyOf(selection)} {...props} details={details} />
      {dispatchKind(BODIES, details)({ project, onEdit, announce, takeFocus })}
      <p className={styles.callers}>{dispatchKind(CALLERS, details)}</p>
      {/* On the page from the start, empty, so a screen reader announces
          a message put in it (UX design §4.4). */}
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
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
      its text version, to see its settings.
    </p>
  );
}

interface DetailsHeaderProps extends SelectionDetailsProps {
  readonly details: Details;
}

/**
 * The heading; Remove, for what can be removed; and Close, if there is
 * one. Remove opens a confirmation under them, and Cancel there returns
 * the focus to Remove.
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
          {removal !== undefined && !open && (
            <Button ref={openerRef} onClick={ask}>
              Remove
            </Button>
          )}
          {closable && <Button onClick={onClose}>Close</Button>}
        </div>
      </div>
      {removal !== undefined && open && (
        <RemoveConfirmation
          text={removal.text}
          onConfirm={() => {
            onRemove(removal.componentId);
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
  readonly componentId: string;
}

/** A component can be removed; an edge can't yet (#96). */
const REMOVALS: KindHandlers<Details, Removal | undefined> = {
  component: ({ componentId, removal }: ComponentDetails) => ({
    text: removal,
    componentId,
  }),
  edge: () => undefined,
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
};

/**
 * What a body needs beyond the details: the project, how to save and
 * announce, and whether its name field takes the focus.
 */
interface BodyContext {
  readonly project: Project;
  readonly onEdit: (command: EditCommand) => void;
  readonly announce: (message: string) => void;
  readonly takeFocus: ProjectSelection["takeFocus"];
}

/** A component's settings can be edited; an edge's are read-only for now. */
const BODIES: KindHandlers<Details, (context: BodyContext) => ReactNode> = {
  component: (details: ComponentDetails) => (context) => (
    // Keyed by the component, so no draft carries over to the next one.
    <ComponentSettings
      key={details.componentId}
      details={details}
      {...context}
    />
  ),
  edge:
    ({ settings }: EdgeDetails) =>
    () => <Settings settings={settings} />,
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

/** Each setting, read-only: its label, its value with the unit, then its help. */
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
