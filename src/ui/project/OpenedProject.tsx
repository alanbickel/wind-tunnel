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
import { useSelection, type ProjectSelection } from "./useSelection";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
}

/**
 * A project that opened: the project bar, then its architecture beside
 * the Details and Run tabs in a wide window, or above Details (while
 * something is selected) and the run's results in a narrow one. The run
 * and the selection are held here, so every part of the screen reads the
 * same ones, and a tab or layout change doesn't stop the run.
 */
export function OpenedProject({ record }: OpenedProjectProps) {
  const { project } = record;
  const projectRun = useProjectRun(project);
  const selecting = useSelection();
  const architecture = useArchitecture(record, selecting);
  const Column = useWideWindow() ? SideTabs : Stacked;

  return (
    <div className={styles.project}>
      <ProjectBar project={project} projectRun={projectRun} />
      <div className={styles.columns}>
        {architecture}
        <Column
          project={project}
          projectRun={projectRun}
          selecting={selecting}
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
}

/** Details and Run, beside the architecture; Run first. */
function SideTabs({ project, projectRun, selecting }: ColumnProps) {
  const { selection, tab, showTab, close } = selecting;
  const details =
    selection === undefined ? (
      <NothingSelected />
    ) : (
      <SelectionDetails
        project={project}
        selection={selection}
        onClose={close}
      />
    );
  return (
    <Tabs
      label="Project"
      selected={tab}
      onSelect={showTab}
      tabs={[
        { id: "details", label: "Details", content: details },
        {
          id: "run",
          label: "Run",
          content: <RunResults meaning={projectRun.meaning} />,
        },
      ]}
    />
  );
}

/** Under the architecture: Details while something is selected, then Run. */
function Stacked({ project, projectRun, selecting }: ColumnProps) {
  const { selection, close } = selecting;
  return (
    <>
      {selection !== undefined && (
        <Panel heading="Details">
          <SelectionDetails
            project={project}
            selection={selection}
            onClose={close}
            closable
          />
        </Panel>
      )}
      <RunPanel meaning={projectRun.meaning} />
    </>
  );
}
