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
import type { EditCommand, ProjectEdits } from "./useProjectEdits";
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
}

/**
 * What changes a project's shape (UX design §2.4): each is one edit
 * command, saved like any other, and the selection and focus that follow.
 */
export function useAddAndRemove(
  edits: ProjectEdits,
  selecting: ProjectSelection,
): AddAndRemove {
  const { newComponent } = useUseCases();
  const { edit, record } = edits;
  const { select } = selecting;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [announcement, announce] = useAnnouncement();
  const add = useCallback(
    (type: string) => {
      const input = newComponent.execute({ type });
      if (input === undefined) return;
      edit((current) => addComponent(current, input));
      select({ kind: "component", componentId: input.componentId }, "name");
    },
    [newComponent, edit, select],
  );
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
  return { add, connect, remove, addButtonRef, announcement };
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
      edit(removal.command);
      clear();
      addButtonRef.current?.focus();
      announce(removal.message);
    },
    [record, edit, clear, announce, addButtonRef],
  );
}

/** A remove's command, and what it announces. */
interface Removal {
  readonly command: EditCommand;
  /** E.g. "Removed Table." or "Removed the edge from API to Function." */
  readonly message: string;
}

/** Each kind's remove, or undefined if the record has no such item. */
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
          command: (current) => removeComponent(current, { componentId }),
          message: `Removed ${removed.name}.`,
        }
      );
    },
  edge:
    ({ edgeId }) =>
    ({ project }) => {
      const removed = project.architecture.edges.find((e) => e.id === edgeId);
      const name = (id: string) => nameOf(project, id);
      return (
        removed && {
          command: (current) => removeEdge(current, { edgeId }),
          message: `Removed the edge from ${name(removed.from)} to ${name(removed.to)}.`,
        }
      );
    },
};
