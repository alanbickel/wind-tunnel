import { useCallback, useRef, type RefObject } from "react";
import { nameOf } from "../../application/details/name-of";
import type { Selection } from "../../application/details/selection";
import {
  addComponent,
  removeComponent,
} from "../../application/edits/component-edits";
import { removeEdge } from "../../application/edits/edge-edits";
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
   * Connects two components, as drawn on the diagram, saves, and announces
   * it, since the canvas says nothing to a screen reader.
   */
  readonly connect: (from: string, to: string) => void;
  /**
   * Removes the component or edge and saves, clears the selection, moves
   * the focus to "Add component", since what made the selection may be
   * gone, and announces it, since the focus has left what changed.
   */
  readonly remove: (target: Selection) => void;
  /** The "Add component" button. */
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
  /** "Removed Table.", for the polite region beside "Add component". */
  readonly announcement: string;
  /** Says a message in that region, without moving the focus. */
  readonly announce: (message: string) => void;
}

/**
 * What changes a project's shape (UX design §2.4): each is one edit
 * command, saved like any other, and the selection and focus that follow.
 */
export function useAddAndRemove(
  edits: ProjectEdits,
  selecting: ProjectSelection,
): AddAndRemove {
  const { edit, record } = edits;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [announcement, announce] = useAnnouncement();
  const add = useAdd(edit, selecting.select);
  const connectWith = useConnect(edit);
  const { project } = record;
  const connect = useCallback(
    (from: string, to: string) => {
      const said = connectWith({ project, from, to });
      if (said !== undefined) announce(said);
    },
    [connectWith, project, announce],
  );
  const remove = useRemove({ edits, selecting, addButtonRef, announce });
  return { add, connect, remove, addButtonRef, announcement, announce };
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
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
  readonly announce: (message: string) => void;
}

/** Remove, as `AddAndRemove` describes it. */
function useRemove({
  edits,
  selecting,
  addButtonRef,
  announce,
}: RemoveInput): AddAndRemove["remove"] {
  const { edit, record } = edits;
  const { clear } = selecting;
  return useCallback(
    (target: Selection) => {
      const removal = dispatchKind(REMOVALS, target)(record);
      if (removal === undefined) return;
      edit(removal.edit);
      clear();
      addButtonRef.current?.focus();
      announce(removal.message);
    },
    [record, edit, clear, announce, addButtonRef],
  );
}

/** A remove's edit, and what it announces. */
interface Removal {
  readonly edit: Edit;
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
        message: `Removed ${edge}.`,
      };
    },
  // Nothing removes a workflow or a step yet (issues 116 and 117).
  workflow: () => () => undefined,
  step: () => () => undefined,
};
