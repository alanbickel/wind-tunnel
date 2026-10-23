/**
 * The words for the project's own IDs, at the length being worded: a
 * component type's rejection reasons and limits, as the type registers
 * them, and the workflows' names. An ID with no words is printed as it is,
 * e.g. `too-many-connections` or `queryWorkers`.
 */
export interface Vocabulary {
  reason(input: ComponentWordInput): string;
  limit(input: ComponentWordInput): string;
  workflow(workflowId: string): string;
}

/** A reason or a limit of one component, by ID. */
export interface ComponentWordInput {
  readonly componentId: string;
  /** The reason, e.g. `"throttled"`, or the limit's name, e.g. `"readUnits"`. */
  readonly id: string;
}

/**
 * Words the limits of one component, so a phrase that names several needs
 * no input object for each: `limitsOf(vocabulary, "orders-db")("queryWorkers")`.
 */
export function limitsOf(
  vocabulary: Vocabulary,
  componentId: string,
): (name: string) => string {
  return (id) => vocabulary.limit({ componentId, id });
}
