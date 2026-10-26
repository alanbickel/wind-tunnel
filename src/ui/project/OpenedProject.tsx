import { useMemo } from "react";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import { RunPanel } from "../run/RunPanel";
import { RunResults } from "../run/RunResults";
import { useProjectRun, type ProjectRun } from "../run/useProjectRun";
import { Panel } from "../shared/Panel";
import { Tabs } from "../shared/Tabs";
import { useWideWindow } from "../shared/useWideWindow";
import { ArchitectureView } from "./ArchitectureView";
import styles from "./OpenedProject.module.css";
import { ProjectBar } from "./ProjectBar";
import { NothingSelected, SelectionDetails } from "./SelectionDetails";
import { useProjectEdits, type ProjectEdits } from "./useProjectEdits";
import { useSelection, type ProjectSelection } from "./useSelection";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
}

/**
 * A project that opened: the project bar, then its architecture beside
 * the Details and Run tabs in a wide window, or above Details (while
 * something is selected) and the run's results in a narrow one. The
 * record with its edits, the run, and the selection are held here, so
 * every part of the screen reads the same ones, and a tab or layout change
 * doesn't stop the run.
 */
export function OpenedProject({ record: loaded }: OpenedProjectProps) {
  const edits = useProjectEdits(loaded);
  const { record } = edits;
  const { project } = record;
  const projectRun = useProjectRun(project);
  const selecting = useSelection();
  const architecture = useArchitecture(record, selecting);
  const Column = useWideWindow() ? SideTabs : Stacked;

  return (
    <div className={styles.project}>
      <ProjectBar
        project={project}
        projectRun={projectRun}
        saveFailed={edits.saveFailed}
        onRetry={edits.retry}
      />
      <div className={styles.columns}>
        {architecture}
        <Column
          project={project}
          projectRun={projectRun}
          selecting={selecting}
          onEdit={edits.edit}
        />
      </div>
    </div>
  );
}

/**
 * The architecture, as the same element while the record and the selection
 * are, so React skips it: the run's snapshots re-render the screen several
 * times a second.
 */
function useArchitecture(record: ProjectRecord, selecting: ProjectSelection) {
  const { selection, select, clear } = selecting;
  return useMemo(
    () => (
      <ArchitectureView
        record={record}
        selection={selection}
        onSelect={select}
        onClear={clear}
      />
    ),
    [record, selection, select, clear],
  );
}

/** The column beside or under the architecture, by the window's width. */
interface ColumnProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
}

/** Details and Run, beside the architecture; Run first. */
function SideTabs(props: ColumnProps) {
  const { projectRun, selecting } = props;
  const { tab, showTab } = selecting;
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
          content: <RunResults {...projectRun} />,
        },
      ]}
    />
  );
}

/** The Details tab's content: the selection's details, or that there's none. */
function DetailsTab({ project, selecting, onEdit }: ColumnProps) {
  const { selection, close, takeFocus } = selecting;
  if (selection === undefined) return <NothingSelected />;
  return (
    <SelectionDetails
      project={project}
      selection={selection}
      onEdit={onEdit}
      onClose={close}
      takeFocus={takeFocus}
    />
  );
}

/** Under the architecture: Details while something is selected, then Run. */
function Stacked(props: ColumnProps) {
  const { project, projectRun, selecting, onEdit } = props;
  const { selection, close, takeFocus } = selecting;
  return (
    <>
      {selection !== undefined && (
        <Panel heading="Details">
          <SelectionDetails
            project={project}
            selection={selection}
            onEdit={onEdit}
            onClose={close}
            takeFocus={takeFocus}
            closable
          />
        </Panel>
      )}
      <RunPanel {...projectRun} />
    </>
  );
}
