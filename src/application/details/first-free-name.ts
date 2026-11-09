/** A name's prefix, and the names already taken. */
export interface FirstFreeNameInput {
  /** What every name starts with, e.g. `"lambda"`. */
  readonly prefix: string;
  /** The names in use, compared to the candidates as they are. */
  readonly taken: readonly string[];
}

/**
 * `prefix-1`, `prefix-2`, …: the first that isn't taken. A component's
 * and a workflow's suggested name both come from it, so the user can
 * accept it or type over it.
 */
export function firstFreeName({ prefix, taken }: FirstFreeNameInput): string {
  const used = new Set(taken);
  let number = 1;
  while (used.has(`${prefix}-${String(number)}`)) number++;
  return `${prefix}-${String(number)}`;
}
