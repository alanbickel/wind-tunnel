import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { nameOf } from "../../application/details/name-of";
import { workloadAfterRemoval } from "../../application/details/workload-after-removal";
import type { Selection } from "../../application/details/selection";
import { moveComponent } from "../../application/edits/layout-edits";
import type {
  Point,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import { useProjectRun, type ProjectRun } from "../run/useProjectRun";
import { useWideWindow } from "../shared/useWideWindow";
import type { AddComponentProps } from "./ToolRail";
import { ArchitectureView } from "./ArchitectureView";
import { Inspector, StackedInspector } from "./Inspector";
import type { AddWorkflowProps } from "./WorkflowList";
import type { AddWorkloadProps } from "./WorkloadList";
import styles from "./OpenedProject.module.css";
import { ProjectBar, ProjectStatus } from "./ProjectBar";
import {
  ProjectFrame,
  type ProjectFrameProps,
  type ShellParts,
} from "./ProjectFrame";
import { ProjectName } from "./ProjectName";
import { useAddAndRemove, type AddAndRemove } from "./useAddAndRemove";
import {
  useCanvasPanels,
  type CanvasPanelId,
  type CanvasPanels,
} from "./useCanvasPanels";
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
        onEditWorkload={({ id }) => {
          selecting.select({ kind: "workload", workloadId: id });
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
  const panels = useCanvasPanels();
  const selecting = useSelection(panels.reveal);
  usePickSelectedWorkload({ edits, projectRun, selecting });
  const changes = useAddAndRemove(edits, selecting);
  const undoRedo = useUndoRedo(edits, selecting);
  useUndoShortcuts(undoRedo);
  const move = useMove({
    edit: edits.edit,
    project: edits.record.project,
    announce: changes.announce,
  });
  const remove = useRevealingRemove({ changes, panels, edits, projectRun });
  const covered = useCoveredWidth();
  const architecture = useArchitecture({
    edits,
    selecting,
    changes,
    move,
    panels,
    badges: projectRun.badges,
    coveredRightPx: covered.coveredRightPx,
  });
  const held = { edits, projectRun, selecting, undoRedo };
  return { ...held, remove, covered, architecture };
}

/** What picking the selected workload needs. */
interface PickSelectedWorkloadInput {
  readonly edits: ProjectEdits;
  readonly selecting: ProjectSelection;
  readonly projectRun: ProjectRun;
}

/**
 * Picks a workload in the project bar when it's selected, so Run runs what
 * the user is looking at (UX design §2.7 step 1). The link is one way, and
 * only a selection follows it: picking in the bar changes no selection, and
 * a change to the project doesn't pick again, so it doesn't undo a pick.
 */
function usePickSelectedWorkload(input: PickSelectedWorkloadInput): void {
  const { selecting, projectRun } = input;
  const { selection } = selecting;
  const { pick } = projectRun;
  const projectRef = useRef(input.edits.record.project);
  useEffect(() => {
    projectRef.current = input.edits.record.project;
  });
  useEffect(() => {
    if (selection?.kind !== "workload") return;
    const { workloadId } = selection;
    const workload = projectRef.current.workloads.find(
      (w) => w.id === workloadId,
    );
    if (workload !== undefined) pick(workload);
  }, [selection, pick]);
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
  const { edits, selecting, changes, move, panels, badges } = input;
  const { coveredRightPx } = input;
  const { selection, select, clear } = selecting;
  const adding = useAdding(changes);
  const addingWorkflow = useAddingWorkflow(changes);
  const addingWorkload = useAddingWorkload(changes);
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
      addingWorkload={addingWorkload}
      workflowAnnouncement={changes.workflowAnnouncement}
      panels={panels}
      badges={badges}
      coveredRightPx={coveredRightPx}
    />
  );
}

/** "Add workflow"'s props, the same object while its parts are. */
function useAddingWorkflow(changes: AddAndRemove): AddWorkflowProps {
  const { addWorkflow, addWorkflowButtonRef } = changes;
  return useMemo(
    () => ({ onAdd: addWorkflow, buttonRef: addWorkflowButtonRef }),
    [addWorkflow, addWorkflowButtonRef],
  );
}

/** "Add workload"'s props, the same object while its parts are. */
function useAddingWorkload(changes: AddAndRemove): AddWorkloadProps {
  const { addWorkload, addWorkloadButtonRef } = changes;
  return useMemo(
    () => ({ onAdd: addWorkload, buttonRef: addWorkloadButtonRef }),
    [addWorkload, addWorkloadButtonRef],
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
  readonly badges: ProjectRun["badges"];
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

/** The rail list a remove of each kind opens: where its Add button is. */
const LIST_OF_REMOVED: Partial<Record<Selection["kind"], CanvasPanelId>> = {
  workflow: "workflows",
  workload: "workloads",
};

/** What a remove opens, and picks, around `AddAndRemove`'s. */
interface RevealingRemoveInput {
  readonly changes: AddAndRemove;
  readonly panels: CanvasPanels;
  readonly edits: ProjectEdits;
  readonly projectRun: ProjectRun;
}

/**
 * A remove, as `AddAndRemove` has it, that first opens "Workflows" for a
 * workflow's, or "Workloads" for a workload's: the focus goes to "Add
 * workflow" or "Add workload", in that list, which may be closed. Opened at once, so the
 * button is there to take the focus. A remove of the workload the project
 * bar has picked also picks the one after it, or the one before if it was
 * last, which only the project's list, as it was, can say (UX design §2.7
 * step 11). Removing another leaves the bar's pick alone.
 */
function useRevealingRemove(
  input: RevealingRemoveInput,
): AddAndRemove["remove"] {
  const { remove } = input.changes;
  const { show } = input.panels;
  const { pick, picked } = input.projectRun;
  const { workloads } = input.edits.record.project;
  return useCallback(
    (target: Selection) => {
      const list = LIST_OF_REMOVED[target.kind];
      if (list !== undefined) {
        flushSync(() => {
          show(list);
        });
      }
      // Only the bar's own pick moves; another stays where it is.
      if (target.kind === "workload" && picked?.id === target.workloadId) {
        const removedId = target.workloadId;
        const next = workloadAfterRemoval({ workloads, removedId });
        if (next !== undefined) pick(next);
      }
      remove(target);
    },
    [remove, show, pick, picked, workloads],
  );
}
