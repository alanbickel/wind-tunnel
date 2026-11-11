import { memo, useCallback, useId, useMemo, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { nameOf } from "../../application/details/name-of";
import type { Selection } from "../../application/details/selection";
import { moveComponent } from "../../application/edits/layout-edits";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import { useProjectRun, type ProjectRun } from "../run/useProjectRun";
import { useWideWindow } from "../shared/useWideWindow";
import type { AddComponentProps } from "./AddComponent";
import { ArchitectureView } from "./ArchitectureView";
import { Inspector, StackedInspector } from "./Inspector";
import type { AddWorkflowProps } from "./WorkflowList";
import styles from "./OpenedProject.module.css";
import { ProjectBar, ProjectStatus } from "./ProjectBar";
import {
  ProjectFrame,
  type ProjectFrameProps,
  type ShellParts,
} from "./ProjectFrame";
import { ProjectName } from "./ProjectName";
import { useAddAndRemove, type AddAndRemove } from "./useAddAndRemove";
import { useCanvasPanels, type CanvasPanels } from "./useCanvasPanels";
import { useCoveredWidth, type CoveredWidth } from "./useCoveredWidth";
import { useProjectEdits, type ProjectEdits } from "./useProjectEdits";
import { useSelection, type ProjectSelection } from "./useSelection";
import { useUndoRedo, type UndoRedo } from "./useUndoRedo";
import { useUndoShortcuts } from "./useUndoShortcuts";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
  readonly shell: ShellParts;
  /** Follows the saved record's name, including after Undo and Redo. */
  readonly onProjectNameChange?: (name: string) => void;
}

/**
 * A project that opened, canvas first: one top bar, with the project's
 * name, Rename, and its controls, and under it the canvas. In a wide
 * window the canvas fills the rest of it, with the inspector over its
 * right; in a narrow one it keeps a fixed height, and the inspector's
 * content follows it, full-width. The record with its edits, the run, and
 * the selection are held here, so every part of the screen reads the same
 * ones, and a tab or layout change doesn't stop the run.
 */
export function OpenedProject(props: OpenedProjectProps) {
  const { record: loaded, shell, onProjectNameChange } = props;
  const screen = useProjectScreen({ loaded, onProjectNameChange });
  const cantRunReasonId = useId();
  return (
    <ProjectFrame shell={shell} {...barParts({ screen, cantRunReasonId })}>
      <ProjectCanvas screen={screen} />
    </ProjectFrame>
  );
}

/** What the screen holds, and the id Run and the can't-run line share. */
interface BarPartsInput {
  readonly screen: ProjectScreen;
  readonly cantRunReasonId: string;
}

type BarParts = Pick<ProjectFrameProps, "current" | "controls" | "status">;

/**
 * The project's parts of the top bar: its name and Rename as the last
 * crumb, its controls, and its status line. Run opens the inspector, where
 * the run's results are.
 */
function barParts({ screen, cantRunReasonId }: BarPartsInput): BarParts {
  const { edits, projectRun, undoRedo, selecting } = screen;
  const { project } = edits.record;
  return {
    current: <ProjectName project={project} onEdit={edits.edit} />,
    controls: (
      <ProjectBar
        project={project}
        projectRun={projectRun}
        undoRedo={undoRedo}
        cantRunReasonId={cantRunReasonId}
        onRunStart={() => {
          selecting.showInspector(true);
        }}
      />
    ),
    status: (
      <ProjectStatus
        projectRun={projectRun}
        cantRunReasonId={cantRunReasonId}
        saveFailed={edits.saveFailed}
        onRetry={edits.retry}
      />
    ),
  };
}

interface ProjectCanvasProps {
  readonly screen: ProjectScreen;
}

/** The canvas, and the inspector over it or under it, by the window's width. */
function ProjectCanvas({ screen }: ProjectCanvasProps) {
  const { edits, projectRun, selecting, remove } = screen;
  const { screenRef, inspectorRef } = screen.covered;
  const inspector = {
    project: edits.record.project,
    projectRun,
    selecting,
    onEdit: edits.edit,
    onRemove: remove,
  };
  return (
    <div ref={screenRef} className={styles.screen}>
      {screen.architecture}
      {useWideWindow() ? (
        <Inspector ref={inspectorRef} {...inspector} />
      ) : (
        <StackedInspector {...inspector} />
      )}
    </div>
  );
}

/** What a project screen holds, and the architecture it draws from them. */
interface ProjectScreen {
  readonly edits: ProjectEdits;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly undoRedo: UndoRedo;
  /** Removes as `changes.remove` does, opening the panel the focus goes to. */
  readonly remove: AddAndRemove["remove"];
  /** How much of the canvas the inspector covers, which the diagram fits around. */
  readonly covered: CoveredWidth;
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
  const panels = useCanvasPanels();
  const remove = useRevealingRemove(changes, panels);
  const covered = useCoveredWidth();
  const architecture = useArchitecture({
    edits,
    selecting,
    changes,
    move,
    panels,
    coveredRightPx: covered.coveredRightPx,
  });
  const held = { edits, projectRun, selecting, undoRedo };
  return { ...held, remove, covered, architecture };
}

/**
 * The architecture, drawn again only when one of its props changes, so
 * React skips it otherwise: the run's snapshots re-render the screen
 * several times a second. Each prop is the same object while what it holds
 * is.
 */
const MemoArchitectureView = memo(ArchitectureView);

/** The architecture, from what the screen holds. */
function useArchitecture(input: ArchitectureInput) {
  const { edits, selecting, changes, move, panels, coveredRightPx } = input;
  const { selection, select, clear } = selecting;
  const adding = useAdding(changes);
  const addingWorkflow = useAddingWorkflow(changes);
  return (
    <MemoArchitectureView
      record={edits.record}
      selection={selection}
      onSelect={select}
      onClear={clear}
      onConnect={changes.connect}
      onMove={move}
      adding={adding}
      addingWorkflow={addingWorkflow}
      panels={panels}
      coveredRightPx={coveredRightPx}
    />
  );
}

/** "Add workflow"'s props, the same object while its parts are. */
function useAddingWorkflow(changes: AddAndRemove): AddWorkflowProps {
  const { addWorkflow, addWorkflowButtonRef, workflowAnnouncement } = changes;
  return useMemo(
    () => ({
      onAdd: addWorkflow,
      buttonRef: addWorkflowButtonRef,
      announcement: workflowAnnouncement,
    }),
    [addWorkflow, addWorkflowButtonRef, workflowAnnouncement],
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
  readonly panels: CanvasPanels;
  readonly coveredRightPx: number;
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

/**
 * A remove, as `AddAndRemove` has it, that first opens "Workflows" for a
 * workflow's: the focus goes to "Add workflow", in that panel, which may be
 * closed. Opened at once, so the button is there to take the focus.
 */
function useRevealingRemove(
  changes: AddAndRemove,
  panels: CanvasPanels,
): AddAndRemove["remove"] {
  const { remove } = changes;
  const { show } = panels;
  return useCallback(
    (target: Selection) => {
      if (target.kind === "workflow") {
        flushSync(() => {
          show("workflows");
        });
      }
      remove(target);
    },
    [remove, show],
  );
}
