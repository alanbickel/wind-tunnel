import { useCallback } from "react";
import type { ProjectSummary } from "../../application/ports/project-record";
import { CreateBlank } from "./CreateBlank";
import { NewFromTemplate } from "./NewFromTemplate";

export interface NewProjectProps {
  /** Called after each project is created and saved, either way. */
  readonly onCreated: () => void;
  /** Opens a blank project, once it's created. */
  readonly onOpen: (project: ProjectSummary) => void;
}

/**
 * "New project": a blank one by name, which opens once it's created, or a
 * copy of a template, which joins the list (UX design §2.1 step 1).
 */
export function NewProject({ onCreated, onOpen }: NewProjectProps) {
  const createdBlank = useCallback(
    (project: ProjectSummary) => {
      onCreated();
      onOpen(project);
    },
    [onCreated, onOpen],
  );
  return (
    <section aria-labelledby="new-project-heading">
      <h2 id="new-project-heading">New project</h2>
      <CreateBlank onCreated={createdBlank} />
      <NewFromTemplate onCreated={onCreated} />
    </section>
  );
}
