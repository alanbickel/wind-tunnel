import type { ReactNode } from "react";
import { ThemeControl } from "../theme/ThemeControl";
import { Breadcrumb } from "./Breadcrumb";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  /**
   * The breadcrumb's last crumb, the open project: its name, or its
   * heading and Rename once it has opened. Undefined on the project list.
   */
  readonly current: ReactNode;
  /** Goes back to the project list. */
  readonly onProjects: () => void;
  /** An open project's controls, between the breadcrumb and the theme. */
  readonly children?: ReactNode;
  /** An open project's status line, across the bar under its row. */
  readonly status?: ReactNode;
}

/**
 * Across the top of every screen: the app's name, where you are, an open
 * project's controls, and the theme, then the project's status line.
 */
export function TopBar(props: TopBarProps) {
  const { current, onProjects, children, status } = props;
  return (
    <header className={styles.topBar}>
      <h1 className={styles.name}>Wind Tunnel</h1>
      <Breadcrumb current={current} onProjects={onProjects} />
      {children}
      <div className={styles.end}>
        <ThemeControl />
      </div>
      {status}
    </header>
  );
}
