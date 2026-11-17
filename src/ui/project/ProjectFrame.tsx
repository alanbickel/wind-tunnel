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
  /** A row of the top bar's own, under its first: a narrow window's run group. */
  readonly barRow?: ReactNode;
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
 * `--breakpoint-wide` up. Below it, the page scrolls and the top bar stays
 * at the window's top, and what the page scrolls into view stops below it.
 */
export function ProjectFrame(props: ProjectFrameProps) {
  const { shell, current, controls, barRow, banner, children } = props;
  return (
    <div ref={keepScrollClearOfBar} className={styles.frame}>
      <TopBar current={current} onProjects={shell.onProjects} row={barRow}>
        {controls}
      </TopBar>
      {banner}
      {shell.hint}
      <main className={styles.content}>{children}</main>
    </div>
  );
}

/**
 * A ref callback for the frame: while it's drawn, the page's top scroll
 * padding is the top bar's height, so what the page scrolls into view,
 * such as the inspector's heading that selecting focuses, stops below the
 * bar that stays over it, not under it (WCAG 2.4.11, Focus Not Obscured).
 * The bar's height changes as it wraps, so it's watched.
 */
function keepScrollClearOfBar(frame: HTMLDivElement | null) {
  const bar = frame?.firstElementChild;
  if (!(bar instanceof HTMLElement)) return undefined;
  const page = document.documentElement.style;
  const observer = new ResizeObserver(() => {
    page.setProperty("scroll-padding-top", `${String(bar.offsetHeight)}px`);
  });
  observer.observe(bar);
  return () => {
    observer.disconnect();
    page.removeProperty("scroll-padding-top");
  };
}
