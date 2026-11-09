import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves.

/** A project's new name. */
export interface RenameProjectInput {
  readonly name: string;
}

/**
 * Renames a project. Giving it the name the project already has returns
 * the record unchanged, so nothing saves.
 */
export function renameProject(
  record: ProjectRecord,
  { name }: RenameProjectInput,
): ProjectRecord {
  if (record.project.name === name) return record;
  return {
    ...record,
    project: {
      ...record.project,
      name,
    },
  };
}
