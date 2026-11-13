import { useMemo } from "react";
import type { ComponentTypeChoice } from "../../application/use-cases/list-component-types";
import { useUseCases } from "../app/useUseCases";
import { ComponentIcon } from "../diagram/ComponentIcon";
import styles from "./ComponentTypeList.module.css";

export interface ComponentTypeListProps {
  /** Called with the type the user chose. */
  readonly onChoose: (type: string) => void;
}

/**
 * A button per component type: its icon (ADR-0022), its name, then what
 * it's for (UX design §4).
 */
export function ComponentTypeList({ onChoose }: ComponentTypeListProps) {
  const { listComponentTypes } = useUseCases();
  const choices = useMemo(
    () => listComponentTypes.execute(),
    [listComponentTypes],
  );
  return (
    <ul aria-label="Component types" className={styles.types}>
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
      <ComponentIcon type={type} />
      <span>
        <span className={styles.typeName}>{displayName}</span>
        {purpose !== undefined && `: ${purpose}`}
      </span>
    </button>
  );
}
