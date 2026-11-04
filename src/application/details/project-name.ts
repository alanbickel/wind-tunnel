import type { ProjectSummary } from "../ports/project-record";
import type { DraftCheck } from "./number-draft";

/** A project's name field: what's typed, and the projects it must differ from. */
export interface ProjectNameInput {
  /** What's typed. Spaces around it are dropped. */
  readonly text: string;
  /** The saved projects, from `ListProjects`. */
  readonly projects: readonly ProjectSummary[];
  /**
   * The project being named, whose own name doesn't count against it, as
   * in a rename. Undefined for a project not yet created.
   */
  readonly projectId?: string | undefined;
}

/**
 * What a project's name field says when another project uses the name, as
 * a component's name field does. Also for `CreateBlankProject`'s
 * `name-taken`.
 */
export const PROJECT_NAME_TAKEN =
  "Another project already uses this name. Please choose another name.";

/** A name, and the projects, less the one being named, it's checked against. */
export interface NameTakenInput extends Omit<ProjectNameInput, "text"> {
  /** Compared without the spaces around it, ignoring case. */
  readonly name: string;
}

/**
 * A project's name, checked: not empty, and not used by another project
 * (UX design §2.3, §5). Names are compared without the spaces around them
 * and ignoring case, so "Orders API" and "orders api" clash. Creating a
 * project and renaming one both check it; projects already stored with the
 * same name keep it.
 */
export function checkProjectName({
  text,
  ...others
}: ProjectNameInput): DraftCheck<string> {
  const name = text.trim();
  if (name === "") {
    return { status: "fails", message: "A project needs a name." };
  }
  if (!projectNameTaken({ name, ...others })) {
    return { status: "passes", value: name };
  }
  return { status: "fails", message: PROJECT_NAME_TAKEN };
}

/** Whether a project other than `projectId` already uses the name. */
export function projectNameTaken({
  name,
  projects,
  projectId,
}: NameTakenInput): boolean {
  const key = nameKey(name);
  return projects.some((p) => p.id !== projectId && nameKey(p.name) === key);
}

/**
 * The name, if no project uses it, or the name with the first free number
 * after it: "Serverless API with RDS (2)", then "(3)". A template copy
 * takes its name this way, so creating a project keeps names unique.
 */
export function freeProjectName(
  name: string,
  projects: readonly ProjectSummary[],
): string {
  if (!projectNameTaken({ name, projects })) return name;
  let number = 2;
  while (projectNameTaken({ name: numbered(name, number), projects })) {
    number += 1;
  }
  return numbered(name, number);
}

/** "Serverless API with RDS (2)". */
function numbered(name: string, number: number): string {
  return `${name} (${String(number)})`;
}

/** What two names are compared by: no spaces around it, and one case. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}
