import { memo, useCallback, useMemo, type ReactNode } from "react";
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
import { ArchitectureView } from "./ArchitectureView";
import { Inspector, StackedInspector } from "./Inspector";
import { Dock } from "./dock/Dock";
import type { OverlayProps } from "./dock/overlay";
import { RunGroup } from "./dock/RunGroup";
import type { OfferingProps } from "./useEdgeOffers";
import type { AddWorkflowProps } from "./WorkflowList";
import type { AddWorkloadProps } from "./WorkloadList";
import styles from "./OpenedProject.module.css";
import { ProjectBar } from "./ProjectBar";
import {
  ProjectFrame,
  type ProjectFrameProps,
  type ShellParts,
} from "./ProjectFrame";
import { ProjectName } from "./ProjectName";
import { SaveFailure } from "./SaveFailure";
import { useAddAndRemove, type AddAndRemove } from "./useAddAndRemove";
import { useCanvasPanels, type CanvasPanels } from "./useCanvasPanels";
import { useCoveredWidth, type CoveredWidth } from "./useCoveredWidth";
import {
  useFocusAfterRedraw,
  type FocusAfterRedraw,
} from "./useFocusAfterRedraw";
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
 * content follows it, full-width. The run group is at the end of the
 * dock's tab strip in a wide window, and in the top bar in a narrow one:
 * one of it at a time. The record with its edits, the run, and
 * the selection are held here, so every part of the screen reads the same
 * ones, and a tab or layout change doesn't stop the run.
 */
export function OpenedProject(props: OpenedProjectProps) {
  const { record: loaded, shell, onProjectNameChange } = props;
  const screen = useProjectScreen({ loaded, onProjectNameChange });
  const wide = useWideWindow();
  const runGroup = runGroupOf(screen);
  return (
    <ProjectFrame
      shell={shell}
      {...barParts({ screen, runGroup: wide ? undefined : runGroup })}
    >
      <ProjectCanvas
        screen={screen}
        wide={wide}
        runGroup={wide ? runGroup : undefined}
      />
    </ProjectFrame>
  );
}

/**
 * The run group, from what the screen holds. Run selects the run, so the
 * inspector explains it and the dock's Run tab shows its evidence; the
 * verdict selects it again; Edit selects the picked workload.
 */
function runGroupOf({ edits, projectRun, selecting }: ProjectScreen) {
  return (
    <RunGroup
      project={edits.record.project}
      projectRun={projectRun}
      onRunStart={selecting.showRun}
      onSelectRun={() => {
        selecting.select({ kind: "run" });
      }}
      onEditWorkload={({ id }) => {
        selecting.select({ kind: "workload", workloadId: id });
      }}
    />
  );
}

/** What the screen holds, and the run group, if the top bar holds it. */
interface BarPartsInput {
  readonly screen: ProjectScreen;
  readonly runGroup: ReactNode;
}

type BarParts = Pick<ProjectFrameProps, "current" | "controls" | "banner">;

/**
 * The project's parts of the top bar and the banner under it: its name
 * and Rename as the last crumb, its controls, and a save that failed.
 */
function barParts({ screen, runGroup }: BarPartsInput): BarParts {
  const { edits, undoRedo } = screen;
  const { project } = edits.record;
  return {
    current: <ProjectName project={project} onEdit={edits.edit} />,
    controls: <ProjectBar undoRedo={undoRedo} runGroup={runGroup} />,
    banner: <SaveFailure saveFailed={edits.saveFailed} onRetry={edits.retry} />,
  };
}

interface ProjectCanvasProps {
  readonly screen: ProjectScreen;
  /** Whether the window is at least `--breakpoint-wide` across. */
  readonly wide: boolean;
  /** The run group, if the dock holds it. */
  readonly runGroup: ReactNode;
}

/**
 * The canvas, and the inspector over it or under it, by the window's
 * width; then the dock.
 */
function ProjectCanvas({ screen, wide, runGroup }: ProjectCanvasProps) {
  const { screenRef, inspectorRef } = screen.covered;
  const inspector = overlayPropsOf(screen);
  return (
    <div className={styles.screen}>
      <div ref={screenRef} className={styles.canvas}>
        {screen.architecture}
        {wide ? (
          <Inspector ref={inspectorRef} {...inspector} />
        ) : (
          <StackedInspector {...inspector} />
        )}
      </div>
      <Dock {...inspector} runGroup={runGroup} />
    </div>
  );
}

/** What the inspector and the dock's overlays read, from what the screen holds. */
function overlayPropsOf(screen: ProjectScreen): OverlayProps {
  const { edits, projectRun, selecting, remove, changes } = screen;
  return {
    record: edits.record,
    project: edits.record.project,
    projectRun,
    selecting,
    onEdit: edits.edit,
    onRemove: remove,
    onAdd: changes.add,
    listRef: changes.componentsListRef,
    addingWorkflow: changes.addingWorkflow,
    addingWorkload: changes.addingWorkload,
    stepRows: screen.stepRows,
    announcement: changes.announcement,
  };
}

/** What the dock reads of adding and removing. */
interface DockChanges extends Pick<
  AddAndRemove,
  "add" | "componentsListRef" | "announcement"
> {
  /** The Workflows tab's "Add workflow". */
  readonly addingWorkflow: AddWorkflowProps;
  /** The Workloads tab's "Add workload". */
  readonly addingWorkload: AddWorkloadProps;
}

/** What a project screen holds, and the architecture it draws from them. */
interface ProjectScreen {
  readonly edits: ProjectEdits;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly undoRedo: UndoRedo;
  /** Removes as `changes.remove` does, moving the run group's pick off a removed workload. */
  readonly remove: AddAndRemove["remove"];
  /**
   * What the dock reads of adding and removing: adding a component, a
   * workflow, or a workload, the Components tab's list, and what a remove
   * said.
   */
  readonly changes: DockChanges;
  /** The outline's step lines, which a step's remove or add focuses. */
  readonly stepRows: FocusAfterRedraw;
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
  const panels = useCanvasPanels();
  const selecting = useSelection();
  const { pickedWorkloadId: pickedId, pick } = selecting;
  const projectRun = useProjectRun(edits.record.project, { pickedId, pick });
  const changes = useAddAndRemove(edits, selecting);
  const undoRedo = useUndoRedo(edits, selecting);
  useUndoShortcuts(undoRedo);
  const move = useMove({
    edit: edits.edit,
    project: edits.record.project,
    announce: changes.announce,
  });
  const remove = usePickingRemove({ changes, edits, projectRun });
  const dockChanges = useDockChanges(changes);
  // The screen's, so its layout effect runs after the outline's has drawn.
  const stepRows = useFocusAfterRedraw();
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
  const held = { edits, projectRun, selecting, undoRedo, stepRows };
  return { ...held, remove, changes: dockChanges, covered, architecture };
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
  const offering = useOffering({ edits, selecting, changes });
  return (
    <MemoArchitectureView
      record={edits.record}
      selection={selection}
      onSelect={select}
      onClear={clear}
      onConnect={changes.connect}
      onMove={move}
      panels={panels}
      badges={badges}
      offering={offering}
      coveredRightPx={coveredRightPx}
    />
  );
}

/** What a "+" on an arrow saves through, selects with, and says, the same object while its parts are. */
function useOffering({
  edits,
  selecting,
  changes,
}: Pick<ArchitectureInput, "edits" | "selecting" | "changes">): OfferingProps {
  const { edit } = edits;
  const { selectWithin } = selecting;
  const { announce } = changes;
  return useMemo(
    () => ({ onEdit: edit, onSelect: selectWithin, announce }),
    [edit, selectWithin, announce],
  );
}

/** Adding and removing, with the dock's two Add buttons' props. */
function useDockChanges(changes: AddAndRemove): DockChanges {
  const addingWorkflow = useAddingWorkflow(changes);
  const addingWorkload = useAddingWorkload(changes);
  return { ...changes, addingWorkflow, addingWorkload };
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

/** What a remove picks, around `AddAndRemove`'s. */
interface PickingRemoveInput {
  readonly changes: AddAndRemove;
  readonly edits: ProjectEdits;
  readonly projectRun: ProjectRun;
}

/**
 * A remove, as `AddAndRemove` has it, that moves the run group's pick off
 * a removed workload: a remove of the workload the run group has picked
 * also picks the one after it, or the one before if it was last, which
 * only the project's list, as it was, can say (UX design §2.7 step 11).
 * Removing another leaves the group's pick alone.
 */
function usePickingRemove(input: PickingRemoveInput): AddAndRemove["remove"] {
  const { remove } = input.changes;
  const { pick, picked } = input.projectRun;
  const { workloads } = input.edits.record.project;
  return useCallback(
    (target: Selection) => {
      // Only the group's own pick moves; another stays where it is.
      if (target.kind === "workload" && picked?.id === target.workloadId) {
        const removedId = target.workloadId;
        const next = workloadAfterRemoval({ workloads, removedId });
        if (next !== undefined) pick(next);
      }
      remove(target);
    },
    [remove, pick, picked, workloads],
  );
}
