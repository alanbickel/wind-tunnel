import { useId, type Ref } from "react";
import type { Project } from "../../domain/model/project";
import { RunExplanation } from "../run/RunExplanation";
import type { ProjectRun } from "../run/useProjectRun";
import { Button } from "../shared/Button";
import { useFindingSelecting } from "./useFindingSelecting";
import styles from "./Inspector.module.css";
import { NothingSelected, SelectionDetails } from "./SelectionDetails";
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
 * one surface that shows the selection, or with nothing selected the run's
 * explanation (UX design §2). With a selection shown, Close clears it, as
 * Escape does, so the explanation comes back and the focus returns to what
 * made the selection. With none, Close collapses the inspector to a narrow
 * strip on the canvas's right edge, whose button, the same one, so the
 * focus stays on it, opens it again. Selecting anything, or Run, opens it
 * too. Collapsed, its content stays mounted, hidden, so a draft is still
 * there when it opens. The run's totals and charts are the dock's.
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
 * run's explanation comes back; with none, it collapses the inspector.
 */
function InspectorToggle({ selecting, bodyId }: InspectorToggleProps) {
  const { inspectorOpen, showInspector, close } = selecting;
  const closesDetails =
    inspectorOpen && detailsSelection(selecting) !== undefined;
  return (
    <div className={styles.toggle}>
      <Button
        label={toggleLabel(inspectorOpen, closesDetails)}
        expanded={inspectorOpen}
        controls={bodyId}
        onClick={() => {
          if (closesDetails) close();
          else showInspector(!inspectorOpen);
        }}
      >
        {inspectorOpen ? "Close" : "Inspector"}
      </Button>
    </div>
  );
}

/** What the toggle does, for a screen reader. */
function toggleLabel(inspectorOpen: boolean, closesDetails: boolean): string {
  if (closesDetails) return "Close the details";
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

/**
 * The selection's details; or, with nothing selected, the run's
 * explanation; or, before any run, the project's description and that
 * nothing is selected.
 */
function InspectorContent(props: InspectorContentProps) {
  const { project, projectRun, selecting } = props;
  const finding = useFindingSelecting(project, selecting);
  const selection = detailsSelection(selecting);
  if (selection !== undefined) return <Details {...props} />;
  const { meaning, ran, outOfDate } = projectRun;
  if (meaning === undefined || ran === undefined) {
    return (
      <>
        <ProjectDescription project={project} />
        <NothingSelected />
      </>
    );
  }
  return (
    <RunExplanation
      meaning={meaning}
      ran={ran}
      outOfDate={outOfDate}
      findingSelecting={finding}
    />
  );
}

/** The selection's details, in a region of their own named "Details". */
function Details(props: InspectorContentProps) {
  const { project, selecting, onEdit, onRemove, closable } = props;
  const { selectWithin, close, takeFocus } = selecting;
  const selection = detailsSelection(selecting);
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

interface ProjectDescriptionProps {
  readonly project: Project;
}

/** The project's description, if it has one. */
function ProjectDescription({ project }: ProjectDescriptionProps) {
  if (!project.description) return null;
  return <p className={styles.description}>{project.description}</p>;
}

/**
 * What the inspector details: the selection, unless it's a finding, whose
 * selection only marks the diagram, so the run's explanation stays (UX
 * §5), or a workload, which the dock shows; either reads as nothing
 * selected.
 */
function detailsSelection({ selection }: ProjectSelection) {
  const elsewhere =
    selection?.kind === "finding" || selection?.kind === "workload";
  return elsewhere ? undefined : selection;
}
