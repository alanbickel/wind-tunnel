import { useCallback, useMemo, type ReactNode } from "react";
import { nameOf } from "../../application/details/name-of";
import { moveComponent } from "../../application/edits/layout-edits";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import { RunPanel } from "../run/RunPanel";
import { RunResults } from "../run/RunResults";
import { useProjectRun, type ProjectRun } from "../run/useProjectRun";
import { Panel } from "../shared/Panel";
import { Tabs } from "../shared/Tabs";
import { useWideWindow } from "../shared/useWideWindow";
import type { AddComponentProps } from "./AddComponent";
import { ArchitectureView } from "./ArchitectureView";
import styles from "./OpenedProject.module.css";
import { ProjectBar } from "./ProjectBar";
import { NothingSelected, SelectionDetails } from "./SelectionDetails";
import { useAddAndRemove, type AddAndRemove } from "./useAddAndRemove";
import { useProjectEdits, type ProjectEdits } from "./useProjectEdits";
import { useSelection, type ProjectSelection } from "./useSelection";
import { useUndoRedo, type UndoRedo } from "./useUndoRedo";
import { useUndoShortcuts } from "./useUndoShortcuts";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
  /** Follows the saved record's name, including after Undo and Redo. */
  readonly onProjectNameChange?: (name: string) => void;
}

/**
 * A project that opened: the project bar, then its architecture beside
 * the Details and Run tabs in a wide window, or above Details (while
 * something is selected) and the run's results in a narrow one. The
 * record with its edits, the run, and the selection are held here, so
 * every part of the screen reads the same ones, and a tab or layout change
 * doesn't stop the run.
 */
export function OpenedProject({
  record: loaded,
  onProjectNameChange,
}: OpenedProjectProps) {
  const screen = useProjectScreen({ loaded, onProjectNameChange });
  const { edits, projectRun, undoRedo } = screen;
  const { project } = edits.record;
  const Column = useWideWindow() ? SideTabs : Stacked;

  return (
    <div className={styles.project}>
      <ProjectBar
        project={project}
        projectRun={projectRun}
        undoRedo={undoRedo}
        saveFailed={edits.saveFailed}
        onRetry={edits.retry}
        onEdit={edits.edit}
      />
      <ProjectColumns screen={screen} Column={Column} />
    </div>
  );
}

interface ProjectColumnsProps {
  readonly screen: ProjectScreen;
  readonly Column: typeof SideTabs | typeof Stacked;
}

/** The architecture diagram beside or above the secondary column. */
function ProjectColumns({ screen, Column }: ProjectColumnsProps) {
  const { edits, projectRun, selecting, changes } = screen;
  return (
    <div className={styles.columns}>
      {screen.architecture}
      <Column
        project={edits.record.project}
        projectRun={projectRun}
        selecting={selecting}
        onEdit={edits.edit}
        onRemove={changes.remove}
      />
    </div>
  );
}

/** What a project screen holds, and the architecture it draws from them. */
interface ProjectScreen {
  readonly edits: ProjectEdits;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly changes: AddAndRemove;
  readonly undoRedo: UndoRedo;
  readonly architecture: ReactNode;
}

/** The record a project screen opens, and who follows its name. */
interface ProjectScreenInput {
  readonly loaded: ProjectRecord;
  readonly onProjectNameChange: OpenedProjectProps["onProjectNameChange"];
}

/**
 * The record with its edits and their history, the run, and the
 * selection, and Undo's shortcuts while the screen is open.
 */
function useProjectScreen(input: ProjectScreenInput): ProjectScreen {
  const edits = useProjectEdits(input.loaded, input.onProjectNameChange);
  const projectRun = useProjectRun(edits.record.project);
  const selecting = useSelection();
  const changes = useAddAndRemove(edits, selecting);
  const undoRedo = useUndoRedo(edits, selecting);
  useUndoShortcuts(undoRedo);
  const move = useMove({
    edit: edits.edit,
    project: edits.record.project,
    announce: changes.announce,
  });
  const architecture = useArchitecture({ edits, selecting, changes, move });
  return { edits, projectRun, selecting, changes, undoRedo, architecture };
}

/**
 * The architecture, as the same element while the record and the selection
 * are, so React skips it: the run's snapshots re-render the screen several
 * times a second.
 */
function useArchitecture(input: ArchitectureInput) {
  const { edits, selecting, changes, move } = input;
  const { record } = edits;
  const { addWorkflow, connect } = changes;
  const adding = useAdding(changes);
  const { selection, select, clear } = selecting;
  return useMemo(
    () => (
      <ArchitectureView
        record={record}
        selection={selection}
        onSelect={select}
        onClear={clear}
        onConnect={connect}
        onMove={move}
        adding={adding}
        onAddWorkflow={addWorkflow}
      />
    ),
    [record, selection, select, clear, connect, move, adding, addWorkflow],
  );
}

/** "Add component"'s props, the same object while its parts are. */
function useAdding(changes: AddAndRemove): AddComponentProps {
  const { add, addButtonRef, announcement } = changes;
  return useMemo(
    () => ({ onAdd: add, buttonRef: addButtonRef, announcement }),
    [add, addButtonRef, announcement],
  );
}

/** What the architecture shows, and what it changes. */
interface ArchitectureInput {
  readonly edits: ProjectEdits;
  readonly selecting: ProjectSelection;
  readonly changes: AddAndRemove;
  readonly move: Move;
}

/** Moves a component on the diagram. */
type Move = (componentId: string, position: Point) => void;

/** What a move saves through, the project it names from, and where it's said. */
interface MoveInput {
  readonly edit: ProjectEdits["edit"];
  readonly project: Project;
  readonly announce: AddAndRemove["announce"];
}

/**
 * Saves a component's new place on the diagram, and announces it, since
 * the canvas says nothing to a screen reader. A move back to where the
 * component was saves nothing, so says nothing. A move only changes the
 * layout, which isn't part of the project, so the run on screen stays
 * current (ADR-0018).
 */
function useMove({ edit, project, announce }: MoveInput): Move {
  return useCallback(
    (componentId: string, position: Point) => {
      // `edit` runs the command at once, on the latest record. An object,
      // so the flag set in the command reads as set after it.
      const change = { moved: false };
      const name = nameOf(project, componentId);
      edit({
        command: (record) => {
          const next = moveComponent(record, { componentId, position });
          change.moved = next !== record;
          return next;
        },
        describe: () => `Move ${name}`,
      });
      if (change.moved) announce(`Moved ${name}.`);
    },
    [edit, project, announce],
  );
}

/** The column beside or under the architecture, by the window's width. */
interface ColumnProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
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
function DetailsTab({ project, selecting, onEdit, onRemove }: ColumnProps) {
  const { selection, selectWithin, close, takeFocus } = selecting;
  if (selection === undefined) return <NothingSelected />;
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

/** Under the architecture: Details while something is selected, then Run. */
function Stacked(props: ColumnProps) {
  const { project, projectRun, selecting, onEdit, onRemove } = props;
  const { selection, selectWithin, close, takeFocus } = selecting;
  return (
    <>
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
      <RunPanel {...projectRun} />
    </>
  );
}
