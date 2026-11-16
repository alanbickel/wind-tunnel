import type { ReactNode } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { SettingsMenu } from "./SettingsMenu";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  /**
   * The breadcrumb's last crumb, the open project: its name, or its
   * heading and Rename once it has opened. Undefined on the project list.
   */
  readonly current: ReactNode;
  /** Goes back to the project list. */
  readonly onProjects: () => void;
  /** An open project's controls, between the breadcrumb and the settings menu. */
  readonly children?: ReactNode;
}

/** Three streamlines, the app's mark; the name beside it says what it is. */
function AppMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 7h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a3 3 0 1 1-3 3" />
      <path d="M3 17h7" />
    </svg>
  );
}

/**
 * Across the top of every screen: the app's mark and name, where you are, an open
 * project's controls, and the settings menu. Nothing about the run, except
 * the run group in a narrow window (UX design §2).
 */
export function TopBar(props: TopBarProps) {
  const { current, onProjects, children } = props;
  return (
    <header className={styles.topBar}>
      <AppMark />
      <h1 className={styles.name}>Wind Tunnel</h1>
      <Breadcrumb current={current} onProjects={onProjects} />
      {children}
      <div className={styles.end}>
        <SettingsMenu />
      </div>
    </header>
  );
}
