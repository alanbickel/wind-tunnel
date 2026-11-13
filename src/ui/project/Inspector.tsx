import { useId, type Ref } from "react";
import type { Project } from "../../domain/model/project";
import { RunPanel } from "../run/RunPanel";
import { RunResults } from "../run/RunResults";
import type { ProjectRun } from "../run/useProjectRun";
import { Button } from "../shared/Button";
import { Panel } from "../shared/Panel";
import { Tabs } from "../shared/Tabs";
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
 * the Details and Run tabs. Close collapses it to a narrow strip on the
 * canvas's right edge, whose button opens it again; it's one button, so
 * the focus stays on it either way. Selecting anything, or Run, opens it
 * too. Collapsed, the tabs stay mounted, hidden, so the run's charts are
 * still there when it opens.
 */
export function Inspector({ ref, ...props }: InspectorProps) {
  const { inspectorOpen, showInspector } = props.selecting;
  const bodyId = useId();
  return (
    <section
      ref={ref}
      aria-label="Inspector"
      className={inspectorOpen ? styles.inspector : styles.collapsed}
    >
      <div className={styles.toggle}>
        <Button
          label={inspectorOpen ? "Close the inspector" : "Open the inspector"}
          expanded={inspectorOpen}
          controls={bodyId}
          onClick={() => {
            showInspector(!inspectorOpen);
          }}
        >
          {inspectorOpen ? "Close" : "Inspector"}
        </Button>
      </div>
      <div id={bodyId} hidden={!inspectorOpen} className={styles.body}>
        <SideTabs {...props} />
      </div>
    </section>
  );
}

/** What the inspector's content shows, without its box's ref. */
type InspectorContentProps = Omit<InspectorProps, "ref">;

/** Details and Run, in the inspector; Run first. */
function SideTabs(props: InspectorContentProps) {
  const { project, projectRun, selecting } = props;
  const { tab, showTab } = selecting;
  const finding = useFindingSelecting(project, selecting);
  return (
    <Tabs
      label="Project"
      selected={tab}
      onSelect={showTab}
      tabs={[
        { id: "details", label: "Details", content: <DetailsTab {...props} /> },
        {
          id: "run",
          label: "Run",
          content: <RunResults {...projectRun} findingSelecting={finding} />,
        },
      ]}
    />
  );
}

/**
 * The Details tab's content: the selection's details, or, with nothing
 * selected, the project's description and that there's no selection.
 */
function DetailsTab(props: InspectorContentProps) {
  const { project, selecting, onEdit, onRemove } = props;
  const { selectWithin, close, takeFocus } = selecting;
  const selection = detailsSelection(selecting);
  if (selection === undefined) {
    return (
      <>
        <ProjectDescription project={project} />
        <NothingSelected />
      </>
    );
  }
  return (
    <SelectionDetails
      project={project}
      selection={selection}
      onEdit={onEdit}
      onRemove={onRemove}
      onSelect={selectWithin}
      onClose={close}
      takeFocus={takeFocus}
    />
  );
}

/**
 * A narrow window's inspector content, under the canvas, full-width, with
 * no tabs: Details while something is selected, or the project's
 * description while nothing is and it has one, then Run.
 */
export function StackedInspector(props: InspectorContentProps) {
  const { project, projectRun, selecting, onEdit, onRemove } = props;
  const { selectWithin, close, takeFocus } = selecting;
  const selection = detailsSelection(selecting);
  const finding = useFindingSelecting(project, selecting);
  return (
    <div className={styles.stacked}>
      {selection !== undefined && (
        <Panel heading="Details">
          <SelectionDetails
            project={project}
            selection={selection}
            onEdit={onEdit}
            onRemove={onRemove}
            onSelect={selectWithin}
            onClose={close}
            takeFocus={takeFocus}
            closable
          />
        </Panel>
      )}
      {selection === undefined && project.description && (
        <Panel heading="Details">
          <ProjectDescription project={project} />
        </Panel>
      )}
      <RunPanel {...projectRun} findingSelecting={finding} />
    </div>
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
 * What Details describes: the selection, unless it's a finding, which has
 * no Details, or a workload, which the dock shows; either leaves Details
 * as if nothing were selected.
 */
function detailsSelection({ selection }: ProjectSelection) {
  const elsewhere =
    selection?.kind === "finding" || selection?.kind === "workload";
  return elsewhere ? undefined : selection;
}
