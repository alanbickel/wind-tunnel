import { COMPONENT_ICONS } from "./component-icons";
import styles from "./NodeCard.module.css";

interface ComponentIconProps {
  /** The component's type, e.g. `"lambda"`. */
  readonly type: string;
}

/**
 * The type's icon, hidden from screen readers: the card's type line already
 * says it in words (and the library's own SVG title would repeat it). A type
 * with no icon is drawn without one, so an unknown type still appears.
 */
export function ComponentIcon({ type }: ComponentIconProps) {
  const Icon = Object.hasOwn(COMPONENT_ICONS, type)
    ? COMPONENT_ICONS[type]
    : undefined;
  if (Icon === undefined) return null;
  return (
    <span className={styles.icon} aria-hidden="true">
      <Icon size="100%" />
    </span>
  );
}
