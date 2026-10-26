/** A problem found in a project, located by a path into its data. */
export interface ValidationIssue {
  /** Where the problem is, e.g. `["workflows", 0, "root", "calls", 1]`. */
  readonly path: IssuePath;
  readonly message: string;
}

/** Keys and array indexes from the root of a project to one value in it. */
export type IssuePath = readonly (string | number)[];
