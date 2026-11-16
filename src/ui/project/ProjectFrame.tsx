import type { ReactNode } from "react";
import { TopBar } from "../shell/TopBar";
import styles from "./ProjectFrame.module.css";

/** What the app shell hands a project screen for its frame. */
export interface ShellParts {
  /** Goes back to the project list. */
  readonly onProjects: () => void;
  /** The storage hint, a dismissible strip under the top bar. */
  readonly hint: ReactNode;
}

export interface ProjectFrameProps {
  readonly shell: ShellParts;
  /**
   * The breadcrumb's last crumb: the project's name while it opens, then
   * its heading and Rename.
   */
  readonly current: ReactNode;
  /** The project's controls, in the top bar once it has opened. */
  readonly controls?: ReactNode;
  /**
   * What affects the whole project, in the banner under the top bar,
   * before the storage hint: a save that failed.
   */
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}

/**
 * A project screen's frame: one top bar, with the project's controls in
 * it; the banner under it, which shows only problems that affect the
 * whole project (a failed save, and the dismissible storage hint); and
 * the screen's content filling the rest of the window from
 * `--breakpoint-wide` up.
 */
export function ProjectFrame(props: ProjectFrameProps) {
  const { shell, current, controls, banner, children } = props;
  return (
    <div className={styles.frame}>
      <TopBar current={current} onProjects={shell.onProjects}>
        {controls}
      </TopBar>
      {banner}
      {shell.hint}
      <main className={styles.content}>{children}</main>
    </div>
  );
}
