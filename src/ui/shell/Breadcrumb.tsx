import { Button } from "../shared/Button";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbProps {
  /** The open project's name; undefined on the project list. */
  readonly projectName: string | undefined;
  /** Goes back to the project list. */
  readonly onProjects: () => void;
}

/**
 * Where the user is: Projects, or Projects › the open project. The last
 * crumb is the current page; the one before it goes back.
 */
export function Breadcrumb({ projectName, onProjects }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.trail}>
        {projectName === undefined ? (
          <li aria-current="page">Projects</li>
        ) : (
          <>
            <li>
              <Button variant="link" onClick={onProjects}>
                Projects
              </Button>
            </li>
            <li aria-current="page">
              {/* Hidden from screen readers, which announce the list instead. */}
              <span aria-hidden="true" className={styles.separator}>
                ›
              </span>
              {projectName}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
