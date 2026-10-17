import type { ProjectInvalid } from "../../application/ports/project-repository";
import type { ValidationIssue } from "../../domain/model/validate-project";
import { ScreenHeading } from "../shared/ScreenHeading";

export interface InvalidProjectProps {
  readonly lookup: ProjectInvalid;
}

/** Why a saved project can't be opened: the reason, then each issue. */
export function InvalidProject({ lookup }: InvalidProjectProps) {
  return (
    <div role="alert">
      <ScreenHeading>This project can&apos;t be opened</ScreenHeading>
      <p>{lookup.reason}</p>
      <ul>
        {lookup.issues.map((issue, index) => (
          // Issues have no ID, and two can read the same; the list never reorders.
          <li key={index}>{issueText(issue)}</li>
        ))}
      </ul>
    </div>
  );
}

/** `workflows.0.root: Unknown component "x"`, or just the message at the root. */
function issueText(issue: ValidationIssue): string {
  if (issue.path.length === 0) return issue.message;
  return `${issue.path.join(".")}: ${issue.message}`;
}
