import type { ProjectRecord } from "../ports/project-record";

/** A project, and its new name. */
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
