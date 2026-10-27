import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ComponentTypeChoice } from "../../application/use-cases/list-component-types";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import styles from "./AddComponent.module.css";

export interface AddComponentProps {
  /** Adds a component of the type, and saves it. */
  readonly onAdd: (type: string) => void;
  /** The "Add component" button, where the focus goes after a remove. */
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}

/**
 * "Add component", a button that shows the types to add, each with its
 * line on what it's for (UX design §2.1 step 2). Choosing one closes the
 * list, with the focus back on the button, and adds the component; so the
 * button is what made the new selection, and Escape in Details returns to
 * it. Escape in the list closes it.
 */
export function AddComponent({ onAdd, buttonRef }: AddComponentProps) {
  const { open, toggle, close } = useDisclosure(buttonRef);
  const listId = useId();
  return (
    <div className={styles.add}>
      <Button
        ref={buttonRef}
        expanded={open}
        controls={open ? listId : undefined}
        onClick={toggle}
      >
        Add component
      </Button>
      {open && (
        <TypeList
          id={listId}
          onChoose={(type) => {
            close();
            onAdd(type);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

/** Whether the list is shown, and what shows and hides it. */
interface Disclosure {
  readonly open: boolean;
  readonly toggle: () => void;
  /** Hides the list, and puts the focus back on the button. */
  readonly close: () => void;
}

function useDisclosure(
  buttonRef: RefObject<HTMLButtonElement | null>,
): Disclosure {
  const [open, setOpen] = useState(false);
  return {
    open,
    toggle: () => {
      setOpen(!open);
    },
    close: () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
  };
}

interface TypeListProps {
  readonly id: string;
  readonly onChoose: (type: string) => void;
  readonly onClose: () => void;
}

/** A button per type: its name, then what it's for. */
function TypeList({ id, onChoose, onClose }: TypeListProps) {
  const { listComponentTypes } = useUseCases();
  const choices = useMemo(
    () => listComponentTypes.execute(),
    [listComponentTypes],
  );
  return (
    <ul
      id={id}
      aria-label="Component types"
      className={styles.types}
      onKeyDown={(event) => {
        closeOnEscape(event, onClose);
      }}
    >
      {choices.map((choice) => (
        <li key={choice.type}>
          <TypeButton choice={choice} onChoose={onChoose} />
        </li>
      ))}
    </ul>
  );
}

interface TypeButtonProps {
  readonly choice: ComponentTypeChoice;
  readonly onChoose: (type: string) => void;
}

/** "API Gateway: the front door; …", which adds one. */
function TypeButton({ choice, onChoose }: TypeButtonProps) {
  const { type, displayName, purpose } = choice;
  return (
    <button
      type="button"
      className={styles.type}
      onClick={() => {
        onChoose(type);
      }}
    >
      <span className={styles.typeName}>{displayName}</span>
      {purpose !== undefined && `: ${purpose}`}
    </button>
  );
}

/** Escape closes the list, and goes no further. */
function closeOnEscape(
  event: KeyboardEvent<HTMLElement>,
  onClose: () => void,
): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  onClose();
}
