import { useCallback, useRef, type RefObject } from "react";
import {
  addComponent,
  removeComponent,
} from "../../application/edits/component-edits";
import { useUseCases } from "../app/useUseCases";
import type { ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** Adding and removing components, and the button the focus goes to. */
export interface AddAndRemove {
  /** Adds a component of the type, saves, and selects it for naming. */
  readonly add: (type: string) => void;
  /**
   * Removes the component and saves, clears the selection, and moves the
   * focus to "Add component", since what made the selection may be gone.
   */
  readonly remove: (componentId: string) => void;
  /** The "Add component" button. */
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
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
  const { select, clear } = selecting;
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
  const remove = useCallback(
    (componentId: string) => {
      edit((record) => removeComponent(record, { componentId }));
      clear();
      addButtonRef.current?.focus();
    },
    [edit, clear],
  );
  return { add, remove, addButtonRef };
}
