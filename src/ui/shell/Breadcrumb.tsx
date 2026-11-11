import type { ReactNode } from "react";
import { Button } from "../shared/Button";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbProps {
  /**
   * The open project: its name, or its heading and Rename. Undefined on the
   * project list.
   */
  readonly current: ReactNode;
  /** Goes back to the project list. */
  readonly onProjects: () => void;
}

/**
 * Where the user is: Projects, or Projects › the open project. The last
 * crumb is the current page; the one before it goes back.
 */
export function Breadcrumb({ current, onProjects }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.trail}>
        {current === undefined ? (
          <li aria-current="page">Projects</li>
        ) : (
          <>
            <li>
              <Button variant="link" onClick={onProjects}>
                Projects
              </Button>
            </li>
            <li aria-current="page" className={styles.current}>
              {/* Hidden from screen readers, which announce the list instead. */}
              <span aria-hidden="true" className={styles.separator}>
                ›
              </span>
              {current}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
