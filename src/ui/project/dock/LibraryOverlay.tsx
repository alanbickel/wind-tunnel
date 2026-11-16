import { useMemo } from "react";
import type { ComponentTypeChoice } from "../../../application/use-cases/list-component-types";
import { useUseCases } from "../../app/useUseCases";
import { ComponentIcon } from "../../diagram/ComponentIcon";
import styles from "./LibraryOverlay.module.css";
import type { OverlayProps } from "./overlay";

/**
 * The dock's Library tab, always there and the one place to add a component
 * (UX design §2, §4): a card per component type, with its icon (ADR-0022),
 * its name, and what it's for. Each card is a button, so a click, Enter, or
 * Space adds a component of that type in the next free spot, selected with
 * its name focused. The dock stays on the Library, so the next one is a
 * click away.
 */
export function LibraryOverlay({ onAdd }: OverlayProps) {
  const { listComponentTypes } = useUseCases();
  const choices = useMemo(
    () => listComponentTypes.execute(),
    [listComponentTypes],
  );
  return (
    <ul aria-label="Component types" className={styles.cards}>
      {choices.map((choice) => (
        <li key={choice.type}>
          <TypeCard choice={choice} onChoose={onAdd} />
        </li>
      ))}
    </ul>
  );
}

interface TypeCardProps {
  readonly choice: ComponentTypeChoice;
  readonly onChoose: (type: string) => void;
}

/** "API Gateway", and a line on what it's for; it adds one. */
function TypeCard({ choice, onChoose }: TypeCardProps) {
  const { type, displayName, purpose } = choice;
  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => {
        onChoose(type);
      }}
    >
      <ComponentIcon type={type} />
      <span>
        <span className={styles.name}>{displayName}</span>
        {purpose !== undefined && (
          <>
            {" "}
            <span className={styles.purpose}>{purpose}</span>
          </>
        )}
      </span>
    </button>
  );
}
