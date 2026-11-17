import { useCallback, useId, type KeyboardEvent, type ReactNode } from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import { RunExplanation } from "../run/RunExplanation";
import type { ProjectRun } from "../run/useProjectRun";
import { Button } from "../shared/Button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "../shared/PanelIcons";
import { useFindingSelecting } from "./useFindingSelecting";
import styles from "./Inspector.module.css";
import { ProjectOverview } from "./ProjectOverview";
import { SelectionDetails } from "./SelectionDetails";
import type { AddAndRemove } from "./useAddAndRemove";
import type { FocusAfterRedraw } from "./useFocusAfterRedraw";
import type { ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** What the inspector shows, and what it changes. */
export interface InspectorProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
  /** The outline's step lines, where a selected step's remove sends the focus. */
  readonly stepRows: FocusAfterRedraw;
}

/**
 * A wide window's inspector, a full-height column on the right, beside the
 * canvas and the dock: × and the chevron, then one surface that shows what
 * the selection alone decides (UX design §5, rule 1): a thing's details,
 * the run's explanation, or with nothing selected the project's overview.
 * Each control does one thing (rule 7). × is there only while something
 * is selected; it clears the selection, as Escape does, so the overview
 * comes back and the focus returns to what made the selection. The
 * chevron collapses the inspector to a narrow strip on the right edge,
 * keeping the selection, and the strip's chevron, the same button, so the
 * focus stays on it, opens it again on the same thing. Selecting anything,
 * or Run, opens it too. Collapsed, its content stays mounted, hidden, so a
 * draft is still there when it opens. The run's totals and charts are the
 * dock's.
 */
export function Inspector(props: InspectorProps) {
  const { inspectorOpen } = props.selecting;
  const bodyId = useId();
  return (
    <section
      aria-label="Inspector"
      className={inspectorOpen ? styles.inspector : styles.collapsed}
    >
      <InspectorControls selecting={props.selecting} bodyId={bodyId} />
      {/* A tab stop, so the keyboard can scroll it. */}
      <div
        id={bodyId}
        hidden={!inspectorOpen}
        className={styles.body}
        tabIndex={0}
      >
        <InspectorContent {...props} />
      </div>
    </section>
  );
}

interface InspectorControlsProps {
  readonly selecting: ProjectSelection;
  /** The content the chevron shows and hides. */
  readonly bodyId: string;
}

/**
 * × while the open inspector shows a selection, then the chevron: one
 * clears, the other collapses or opens, whatever the inspector shows.
 */
function InspectorControls({ selecting, bodyId }: InspectorControlsProps) {
  const { inspectorOpen, showInspector, close } = selecting;
  const closing = CLOSE_LABELS[contentKindOf(selecting.selection)];
  const open = inspectorOpen ? COLLAPSING : OPENING;
  return (
    <div className={styles.controls}>
      {inspectorOpen && closing !== undefined && (
        <Button variant="icon" label={closing} title={closing} onClick={close}>
          <CloseIcon />
        </Button>
      )}
      <Button
        variant="icon"
        label={open.label}
        title={open.label}
        expanded={inspectorOpen}
        controls={bodyId}
        onClick={() => {
          showInspector(!inspectorOpen);
        }}
      >
        {open.icon}
      </Button>
    </div>
  );
}

/** What the chevron says and draws, by what it does. */
interface ChevronLook {
  readonly label: string;
  readonly icon: ReactNode;
}

/** The open inspector's chevron, which collapses it to the right. */
const COLLAPSING: ChevronLook = {
  label: "Collapse the inspector",
  icon: <ChevronRightIcon />,
};

/** The strip's chevron, which opens the inspector to the left. */
const OPENING: ChevronLook = {
  label: "Open the inspector",
  icon: <ChevronLeftIcon />,
};

/**
 * A narrow window's inspector, under the canvas, full-width: the same one
 * surface as a wide window's, with a Close beside the selection's heading.
 * It has no chevron: it's a section of a page that scrolls, with no edge
 * to collapse to.
 */
export function StackedInspector(props: InspectorContentProps) {
  return (
    <div className={styles.stacked}>
      <section aria-label="Inspector" className={styles.surface}>
        <InspectorContent {...props} closable />
      </section>
    </div>
  );
}

/** What the inspector's content shows. */
interface InspectorContentProps extends InspectorProps {
  /** Shows a Close beside the selection's heading, as the narrow layout does. */
  readonly closable?: boolean;
}

/** A selection's kind, or "nothing" with none. */
type ContentKind = Selection["kind"] | "nothing";

function contentKindOf(selection: Selection | undefined): ContentKind {
  return selection?.kind ?? "nothing";
}

/** What the inspector shows for each kind of selection, and for none. */
const CONTENTS: Record<
  ContentKind,
  (props: InspectorContentProps) => ReactNode
> = {
  nothing: Overview,
  component: Details,
  edge: Details,
  workflow: Details,
  step: Details,
  "new-workflow": Details,
  workload: Details,
  run: TheRun,
  // The finding is marked in the run's explanation.
  finding: TheRun,
};

/**
 * What × says while it clears a selection of each kind; undefined with
 * nothing selected, where there's no ×.
 */
const CLOSE_LABELS: Record<ContentKind, string | undefined> = {
  nothing: undefined,
  component: "Close the details",
  edge: "Close the details",
  workflow: "Close the details",
  step: "Close the details",
  "new-workflow": "Close the details",
  workload: "Close the details",
  run: "Close the run",
  finding: "Close the run",
};

/** What the selection alone decides the inspector shows (rule 1). */
function InspectorContent(props: InspectorContentProps) {
  const Content = CONTENTS[contentKindOf(props.selecting.selection)];
  return <Content {...props} />;
}

/** With nothing selected: the project's overview, whose verdict selects the run. */
function Overview({ project, projectRun, selecting }: InspectorContentProps) {
  const takeFocus = useHeadingFocus(selecting);
  return (
    <ProjectOverview
      project={project}
      projectRun={projectRun}
      onSelectRun={() => {
        selecting.select({ kind: "run" });
      }}
      takeFocus={takeFocus}
    />
  );
}

/**
 * With the run or one of its findings selected: the run's explanation.
 * Escape in it, once a finding or an open explanation has had its own,
 * closes the run, as × does. Nothing shows in the moment before a run
 * just started has its first snapshot.
 */
function TheRun({ project, projectRun, selecting }: InspectorContentProps) {
  const finding = useFindingSelecting(project, selecting);
  const takeFocus = useHeadingFocus(selecting);
  const { meaning, ran, outOfDate } = projectRun;
  if (meaning === undefined || ran === undefined) return null;
  return (
    // Escape bubbles here from the explanation's buttons, which have the
    // focus; the explanation itself is never focused but by its heading.
    <div
      onKeyDown={(event) => {
        closeOnEscape(event, selecting.close);
      }}
    >
      <RunExplanation
        meaning={meaning}
        ran={ran}
        outOfDate={outOfDate}
        findingSelecting={finding}
        takeFocus={takeFocus}
      />
    </div>
  );
}

/** Escape closes, unless something inside has already answered it. */
function closeOnEscape(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  close();
}

/** Whether the heading shown should take the focus now, as `takeFocus` says. */
function useHeadingFocus({ takeFocus }: ProjectSelection): () => boolean {
  return useCallback(() => takeFocus("heading"), [takeFocus]);
}

/** The selection's details, in a region of their own named "Details". */
function Details(props: InspectorContentProps) {
  const { project, selecting, onEdit, onRemove, stepRows, closable } = props;
  const { selection, selectWithin, close, takeFocus } = selecting;
  if (selection === undefined) return null;
  return (
    <section aria-label="Details">
      <SelectionDetails
        project={project}
        selection={selection}
        onEdit={onEdit}
        onRemove={onRemove}
        onSelect={selectWithin}
        stepRows={stepRows}
        onClose={close}
        takeFocus={takeFocus}
        closable={closable ?? false}
      />
    </section>
  );
}
