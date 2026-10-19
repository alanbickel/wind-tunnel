import { ThemeControl } from "../theme/ThemeControl";
import { Breadcrumb } from "./Breadcrumb";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  /** The open project's name; undefined on the project list. */
  readonly projectName: string | undefined;
  /** Goes back to the project list. */
  readonly onProjects: () => void;
}

/** Across the top of every screen: the app's name, where you are, the theme. */
export function TopBar({ projectName, onProjects }: TopBarProps) {
  return (
    <header className={styles.topBar}>
      <h1 className={styles.name}>Wind Tunnel</h1>
      <Breadcrumb projectName={projectName} onProjects={onProjects} />
      <div className={styles.end}>
        <ThemeControl />
      </div>
    </header>
  );
}
