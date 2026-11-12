import { useCallback, useRef, type RefObject } from "react";
import { nameOf } from "../../application/details/name-of";
import type { Selection } from "../../application/details/selection";
import {
  addComponent,
  removeComponent,
} from "../../application/edits/component-edits";
import { removeEdge } from "../../application/edits/edge-edits";
import { removeWorkflow } from "../../application/edits/workflow-edits";
import {
  addWorkload,
  removeWorkload,
} from "../../application/edits/workload-edits";
import type { Project } from "../../domain/model/project";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { useUseCases } from "../app/useUseCases";
import { dispatchKind } from "../shared/kind-dispatch";
import { useAnnouncement } from "../shared/useAnnouncement";
import { useConnect } from "./useConnect";
import type { Edit, ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** Adding, connecting, and removing, and the button the focus goes to. */
export interface AddAndRemove {
  /** Adds a component of the type, saves, and selects it for naming. */
  readonly add: (type: string) => void;
  /**
   * Opens a new workflow in Details as a draft, its name field taking the
   * focus. Nothing is saved until its first step is complete.
   */
  readonly addWorkflow: () => void;
  /**
   * Adds a workload with the editor's defaults, saves, and selects it for
   * naming. It's complete at once, so nothing waits as a draft.
   */
  readonly addWorkload: () => void;
  /**
   * Connects two components, as drawn on the diagram, saves, and announces
   * it, since the canvas says nothing to a screen reader.
   */
  readonly connect: (from: string, to: string) => void;
  /**
   * Removes the component, edge, workflow, or workload and saves, clears
   * the selection, moves the focus to "Add component" ("Add workflow" for
   * a workflow, "Add workload" for a workload), since what made the selection may be gone, and announces it
   * in the region beside that button, since the focus has left what changed.
   */
  readonly remove: (target: Selection) => void;
  /** The "Add component" button. */
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
  /** "Removed Table.", for the polite region beside "Add component". */
  readonly announcement: string;
  /** Says a message in that region, without moving the focus. */
  readonly announce: (message: string) => void;
  /** The "Add workflow" button, where the focus goes after a workflow's remove. */
  readonly addWorkflowButtonRef: RefObject<HTMLButtonElement | null>;
  /** The "Add workload" button, where the focus goes after a workload's remove. */
  readonly addWorkloadButtonRef: RefObject<HTMLButtonElement | null>;
  /**
   * "Removed Get order.", or "Removed Lunch rush." for a workload, for the
   * polite region beside the canvas's panel buttons, which always show,
   * unlike the "Workflows" panel that holds both Add buttons.
   */
  readonly workflowAnnouncement: string;
}

/** Where a remove leaves the focus, and says what it removed. */
interface RemovalPlace {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly announce: (message: string) => void;
}

/** The button a remove sends the focus to: by what it removed. */
type RemovalPlaceName = "component" | "workflow" | "workload";

type RemovalPlaces = Readonly<Record<RemovalPlaceName, RemovalPlace>>;

/**
 * What changes a project's shape (UX design §2.4): each is one edit
 * command, saved like any other, and the selection and focus that follow.
 */
export function useAddAndRemove(
  edits: ProjectEdits,
  selecting: ProjectSelection,
): AddAndRemove {
  const { edit } = edits;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [announcement, announce] = useAnnouncement();
  const add = useAdd(edit, selecting.select);
  const addWorkflow = useAddWorkflow(selecting.select);
  const addWorkload = useAddWorkload(edit, selecting.select);
  const connect = useAnnouncedConnect(edits, announce);
  const panel = useRemovalPlaces({
    component: { buttonRef: addButtonRef, announce },
  });
  const { places, addWorkflowButtonRef, addWorkloadButtonRef } = panel;
  const remove = useRemove({ edits, selecting, places });
  return {
    add,
    addWorkflow,
    addWorkload,
    connect,
    remove,
    addButtonRef,
    announcement,
    announce,
    addWorkflowButtonRef,
    addWorkloadButtonRef,
    workflowAnnouncement: panel.announcement,
  };
}

/** The places a remove can leave the focus. */
interface RemovalPlacesResult {
  readonly places: RemovalPlaces;
  readonly addWorkflowButtonRef: RefObject<HTMLButtonElement | null>;
  readonly addWorkloadButtonRef: RefObject<HTMLButtonElement | null>;
  /** What the "Workflows" panel's removes announced. */
  readonly announcement: string;
}

/**
 * The places for each kind of remove. A workflow's and a workload's
 * buttons are in the same panel, which may be closed, so both announce
 * from the one region beside the panel buttons.
 */
function useRemovalPlaces(
  places: Pick<RemovalPlaces, "component">,
): RemovalPlacesResult {
  const addWorkflowButtonRef = useRef<HTMLButtonElement>(null);
  const addWorkloadButtonRef = useRef<HTMLButtonElement>(null);
  const [announcement, announce] = useAnnouncement();
  return {
    places: {
      ...places,
      workflow: { buttonRef: addWorkflowButtonRef, announce },
      workload: { buttonRef: addWorkloadButtonRef, announce },
    },
    addWorkflowButtonRef,
    addWorkloadButtonRef,
    announcement,
  };
}

/** Connect, as `AddAndRemove` describes it. */
function useAnnouncedConnect(
  { edit, record }: ProjectEdits,
  announce: (message: string) => void,
): AddAndRemove["connect"] {
  const connectWith = useConnect(edit);
  const { project } = record;
  return useCallback(
    (from: string, to: string) => {
      const said = connectWith({ project, from, to });
      if (said !== undefined) announce(said);
    },
    [connectWith, project, announce],
  );
}

/** Add workflow, as `AddAndRemove` describes it. */
function useAddWorkflow(
  select: ProjectSelection["select"],
): AddAndRemove["addWorkflow"] {
  return useCallback(() => {
    select({ kind: "new-workflow" }, "name");
  }, [select]);
}

/** Add workload, as `AddAndRemove` describes it. */
function useAddWorkload(
  edit: ProjectEdits["edit"],
  select: ProjectSelection["select"],
): AddAndRemove["addWorkload"] {
  const { newWorkload } = useUseCases();
  return useCallback(() => {
    const input = newWorkload.execute();
    edit({
      command: (current) => addWorkload(current, input),
      // The command names it, so the name is read from the record it made.
      describe: ({ project }) =>
        `Add workload ${workloadNameIn(project, input.workloadId)}`,
    });
    select({ kind: "workload", workloadId: input.workloadId }, "name");
  }, [newWorkload, edit, select]);
}

/** The workload's name, or its id if the project has no such workload. */
function workloadNameIn(project: Project, workloadId: string): string {
  return project.workloads.find((w) => w.id === workloadId)?.name ?? workloadId;
}

/** Add, as `AddAndRemove` describes it. */
function useAdd(
  edit: ProjectEdits["edit"],
  select: ProjectSelection["select"],
): AddAndRemove["add"] {
  const { newComponent } = useUseCases();
  return useCallback(
    (type: string) => {
      const input = newComponent.execute({ type });
      if (input === undefined) return;
      edit({
        command: (current) => addComponent(current, input),
        describe: (after) => `Add ${nameOf(after.project, input.componentId)}`,
      });
      select({ kind: "component", componentId: input.componentId }, "name");
    },
    [newComponent, edit, select],
  );
}

interface RemoveInput {
  readonly edits: ProjectEdits;
  readonly selecting: ProjectSelection;
  readonly places: RemovalPlaces;
}

/** Remove, as `AddAndRemove` describes it. */
function useRemove({
  edits,
  selecting,
  places,
}: RemoveInput): AddAndRemove["remove"] {
  const { edit, record } = edits;
  const { clear } = selecting;
  const { component, workflow, workload } = places;
  return useCallback(
    (target: Selection) => {
      const removal = dispatchKind(REMOVALS, target)(record);
      if (removal === undefined) return;
      const { buttonRef, announce } = {
        component,
        workflow,
        workload,
      }[removal.place];
      edit(removal.edit);
      clear();
      buttonRef.current?.focus();
      announce(removal.message);
    },
    [record, edit, clear, component, workflow, workload],
  );
}

/** A remove's edit, where its focus goes, and what it announces. */
interface Removal {
  readonly edit: Edit;
  readonly place: RemovalPlaceName;
  /** E.g. "Removed Table." or "Removed the edge from API to Function." */
  readonly message: string;
}

/**
 * Each kind's remove, or undefined if the record has no such item, or the
 * kind can't be removed.
 */
const REMOVALS: KindHandlers<
  Selection,
  (record: ProjectRecord) => Removal | undefined
> = {
  component:
    ({ componentId }) =>
    ({ project }) => {
      const removed = project.architecture.components.find(
        (c) => c.id === componentId,
      );
      return (
        removed && {
          edit: {
            command: (current) => removeComponent(current, { componentId }),
            describe: () => `Remove ${removed.name}`,
          },
          place: "component",
          message: `Removed ${removed.name}.`,
        }
      );
    },
  edge:
    ({ edgeId }) =>
    ({ project }) => {
      const removed = project.architecture.edges.find((e) => e.id === edgeId);
      if (removed === undefined) return undefined;
      const name = (id: string) => nameOf(project, id);
      const edge = `the edge from ${name(removed.from)} to ${name(removed.to)}`;
      return {
        edit: {
          command: (current) => removeEdge(current, { edgeId }),
          describe: () => `Remove ${edge}`,
        },
        place: "component",
        message: `Removed ${edge}.`,
      };
    },
  workflow:
    ({ workflowId }) =>
    ({ project }) => {
      const removed = project.workflows.find((w) => w.id === workflowId);
      if (removed === undefined) return undefined;
      return {
        edit: {
          command: (current) => removeWorkflow(current, { workflowId }),
          describe: () => `Remove workflow ${removed.name}`,
        },
        place: "workflow",
        message: `Removed ${removed.name}.`,
      };
    },
  // Nothing removes a step yet (issue 117).
  step: () => () => undefined,
  workload:
    ({ workloadId }) =>
    ({ project }) => {
      const removed = project.workloads.find((w) => w.id === workloadId);
      if (removed === undefined) return undefined;
      return {
        edit: {
          command: (current) => removeWorkload(current, { workloadId }),
          describe: () => `Remove workload ${removed.name}`,
        },
        place: "workload",
        message: `Removed ${removed.name}.`,
      };
    },
  // A draft is dropped, not removed.
  "new-workflow": () => () => undefined,
  // A finding is of the run; there's nothing to remove.
  finding: () => () => undefined,
};
