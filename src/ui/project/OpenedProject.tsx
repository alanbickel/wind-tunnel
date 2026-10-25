import { useMemo, useState } from "react";
import type { ProjectRecord } from "../../application/ports/project-record";
import { RunPanel } from "../run/RunPanel";
import { RunResults } from "../run/RunResults";
import { useProjectRun, type ProjectRun } from "../run/useProjectRun";
import { Tabs } from "../shared/Tabs";
import { useWideWindow } from "../shared/useWideWindow";
import { ArchitectureView } from "./ArchitectureView";
import styles from "./OpenedProject.module.css";
import { ProjectBar } from "./ProjectBar";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
}

/**
 * A project that opened: the project bar, then its architecture beside
 * the Details and Run tabs in a wide window, or above the run's results in
 * a narrow one. The run is held here, so the bar and the results read the
 * same one, and a tab or layout change doesn't stop it.
 */
export function OpenedProject({ record }: OpenedProjectProps) {
  const { project } = record;
  const projectRun = useProjectRun(project);
  const wide = useWideWindow();
  // The same element while the record is, so React skips it: the run's
  // snapshots re-render this screen several times a second.
  const architecture = useMemo(
    () => <ArchitectureView record={record} />,
    [record],
  );

  return (
    <div className={styles.project}>
      <ProjectBar project={project} projectRun={projectRun} />
      <div className={styles.columns}>
        {architecture}
        {wide ? (
          <SideTabs projectRun={projectRun} />
        ) : (
          <RunPanel meaning={projectRun.meaning} />
        )}
      </div>
    </div>
  );
}

/** The right column's tabs. */
type SideTab = "details" | "run";

interface SideTabsProps {
  readonly projectRun: ProjectRun;
}

/** Details and Run, beside the architecture; Run first. */
function SideTabs({ projectRun }: SideTabsProps) {
  const [selected, setSelected] = useState<SideTab>("run");
  return (
    <Tabs
      label="Project"
      selected={selected}
      onSelect={setSelected}
      tabs={[
        {
          id: "details",
          label: "Details",
          content: <p className={styles.empty}>Nothing selected.</p>,
        },
        {
          id: "run",
          label: "Run",
          content: <RunResults meaning={projectRun.meaning} />,
        },
      ]}
    />
  );
}
