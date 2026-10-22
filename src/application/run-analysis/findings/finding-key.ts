import type { FindingKey } from "./finding";

/** The key's fields, in the order `compareKeys` compares them. */
const FIELDS: readonly (keyof FindingKey)[] = [
  "kind",
  "componentId",
  "reason",
  "limitName",
];

/** Whether two keys name the same finding: every field is equal. */
export function sameKey(a: FindingKey, b: FindingKey): boolean {
  return compareKeys(a, b) === 0;
}

/**
 * Field by field, in `FIELDS` order, each by code unit rather than locale,
 * so the order doesn't depend on the machine. A field left undefined sorts
 * before any value.
 */
export function compareKeys(a: FindingKey, b: FindingKey): number {
  for (const field of FIELDS) {
    const order = compareFields(a[field], b[field]);
    if (order !== 0) return order;
  }
  return 0;
}

function compareFields(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return a < b ? -1 : 1;
}

/** A key's fields; those a kind doesn't use may be left out. */
export type FindingKeyInput = Pick<FindingKey, "kind" | "componentId"> &
  Partial<FindingKey>;

/** The key, with the fields left out set to undefined. */
export function findingKey(input: FindingKeyInput): FindingKey {
  return { reason: undefined, limitName: undefined, ...input };
}
