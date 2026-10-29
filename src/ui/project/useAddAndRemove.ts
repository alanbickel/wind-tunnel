import { useCallback, useRef, type RefObject } from "react";
import {
  addComponent,
  removeComponent,
} from "../../application/edits/component-edits";
import { useUseCases } from "../app/useUseCases";
import { useAnnouncement } from "../shared/useAnnouncement";
import type { ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** Adding and removing components, and the button the focus goes to. */
export interface AddAndRemove {
  /** Adds a component of the type, saves, and selects it for naming. */
  readonly add: (type: string) => void;
  /**
   * Removes the component and saves, clears the selection, moves the focus
   * to "Add component", since what made the selection may be gone, and
   * announces it, since the focus has left what changed.
   */
  readonly remove: (componentId: string) => void;
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
  const { edit } = edits;
  const { select } = selecting;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const add = useCallback(
    (type: string) => {
      const input = newComponent.execute({ type });
      if (input === undefined) return;
      edit((record) => addComponent(record, input));
      select({ kind: "component", componentId: input.componentId }, "name");
    },
    [newComponent, edit, select],
  );
  const { remove, announcement } = useRemove({
    edits,
    selecting,
    addButtonRef,
  });
  return { add, remove, addButtonRef, announcement };
}

interface RemoveInput {
  readonly edits: ProjectEdits;
  readonly selecting: ProjectSelection;
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
}

/** Remove, as `AddAndRemove` describes it, and what it announces. */
function useRemove({
  edits,
  selecting,
  addButtonRef,
}: RemoveInput): Pick<AddAndRemove, "remove" | "announcement"> {
  const { edit } = edits;
  const { clear } = selecting;
  const [announcement, announce] = useAnnouncement();
  const { components } = edits.record.project.architecture;
  const remove = useCallback(
    (componentId: string) => {
      const removed = components.find((c) => c.id === componentId);
      if (removed === undefined) return;
      edit((record) => removeComponent(record, { componentId }));
      clear();
      addButtonRef.current?.focus();
      announce(`Removed ${removed.name}.`);
    },
    [components, edit, clear, announce, addButtonRef],
  );
  return { remove, announcement };
}
