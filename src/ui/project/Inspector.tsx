import {
  useCallback,
  useId,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import { RunExplanation } from "../run/RunExplanation";
import type { ProjectRun } from "../run/useProjectRun";
import { Button } from "../shared/Button";
import { useFindingSelecting } from "./useFindingSelecting";
import styles from "./Inspector.module.css";
import { ProjectOverview } from "./ProjectOverview";
import { SelectionDetails } from "./SelectionDetails";
import type { AddAndRemove } from "./useAddAndRemove";
import type { ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** What the inspector shows, and what it changes. */
export interface InspectorProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
  /** The inspector's box, so the screen can measure what it covers. */
  readonly ref?: Ref<HTMLElement> | undefined;
}

/**
 * A wide window's inspector, floating over the canvas's right: Close, then
 * one surface that shows what the selection alone decides (UX design §5,
 * rule 1): a thing's details, the run's explanation, or with nothing
 * selected the project's overview. With a selection shown, Close clears
 * it, as Escape does, so the overview comes back and the focus returns to
 * what made the selection. With none, Close collapses the inspector to a
 * narrow strip on the canvas's right edge, whose button, the same one, so
 * the focus stays on it, opens it again. Selecting anything, or Run, opens
 * it too. Collapsed, its content stays mounted, hidden, so a draft is
 * still there when it opens. The run's totals and charts are the dock's.
 */
export function Inspector({ ref, ...props }: InspectorProps) {
  const { inspectorOpen } = props.selecting;
  const bodyId = useId();
  return (
    <section
      ref={ref}
      aria-label="Inspector"
      className={inspectorOpen ? styles.inspector : styles.collapsed}
    >
      <InspectorToggle selecting={props.selecting} bodyId={bodyId} />
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

interface InspectorToggleProps {
  readonly selecting: ProjectSelection;
  /** The content the toggle shows and hides. */
  readonly bodyId: string;
}

/**
 * Close, or on the collapsed strip, Inspector: one button, so the focus
 * stays. With a selection shown, Close clears it, as Escape does, so the
 * overview comes back; with none, it collapses the inspector.
 */
function InspectorToggle({ selecting, bodyId }: InspectorToggleProps) {
  const { inspectorOpen, showInspector, close } = selecting;
  const closing = CLOSE_LABELS[contentKindOf(selecting.selection)];
  const closesSelection = inspectorOpen && closing !== undefined;
  return (
    <div className={styles.toggle}>
      <Button
        label={toggleLabel(
          inspectorOpen,
          closesSelection ? closing : undefined,
        )}
        expanded={inspectorOpen}
        controls={bodyId}
        onClick={() => {
          if (closesSelection) close();
          else showInspector(!inspectorOpen);
        }}
      >
        {inspectorOpen ? "Close" : "Inspector"}
      </Button>
    </div>
  );
}

/** What the toggle does, for a screen reader. */
function toggleLabel(
  inspectorOpen: boolean,
  closing: string | undefined,
): string {
  if (closing !== undefined) return closing;
  return inspectorOpen ? "Close the inspector" : "Open the inspector";
}

/**
 * A narrow window's inspector, under the canvas, full-width: the same one
 * surface as a wide window's, with a Close beside the selection's heading.
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

/** What the inspector's content shows, without its box's ref. */
interface InspectorContentProps extends Omit<InspectorProps, "ref"> {
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
  // Today a workload opens in the dock and collapses the inspector, which
  // shows the overview if it's opened; slice 5 of issue 246 gives it its
  // details here.
  workload: OverviewBesideWorkload,
  run: TheRun,
  // The finding is marked in the run's explanation.
  finding: TheRun,
};

/**
 * What Close says while it clears a selection of each kind; undefined for
 * the kinds it doesn't clear, where it collapses the inspector instead.
 */
const CLOSE_LABELS: Record<ContentKind, string | undefined> = {
  nothing: undefined,
  component: "Close the details",
  edge: "Close the details",
  workflow: "Close the details",
  step: "Close the details",
  "new-workflow": "Close the details",
  workload: undefined,
  run: "Close the run",
  finding: "Close the run",
};

/** What the selection alone decides the inspector shows (rule 1). */
function InspectorContent(props: InspectorContentProps) {
  const Content = CONTENTS[contentKindOf(props.selecting.selection)];
  return <Content {...props} />;
}

/** With nothing selected: the project's overview, whose verdict selects the run. */
function Overview(props: InspectorContentProps) {
  const takeFocus = useHeadingFocus(props.selecting);
  return <OverviewTaking {...props} takeFocus={takeFocus} />;
}

/**
 * With a workload selected, in the dock: the overview, whose heading
 * never takes the focus, since the workload's heading in the dock does.
 */
function OverviewBesideWorkload(props: InspectorContentProps) {
  return <OverviewTaking {...props} takeFocus={neverTakesFocus} />;
}

function neverTakesFocus(): boolean {
  return false;
}

interface OverviewTakingProps extends InspectorContentProps {
  readonly takeFocus: () => boolean;
}

/** The overview, its heading taking the focus as `takeFocus` says. */
function OverviewTaking(props: OverviewTakingProps) {
  const { project, projectRun, selecting, takeFocus } = props;
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
  const { project, selecting, onEdit, onRemove, closable } = props;
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
        onClose={close}
        takeFocus={takeFocus}
        closable={closable ?? false}
      />
    </section>
  );
}
