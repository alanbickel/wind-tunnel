/**
 * Whether two values of plain data (what a project holds: objects, arrays,
 * strings, numbers, booleans) have the same content, however they were
 * built. Key order doesn't matter, and a key set to undefined is the same
 * as one left out, as in the stored JSON document.
 */
export function sameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  return sameEntries(a, b);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * The same number of keys, each with the same content in both. A key `b`
 * lacks reads as undefined there, which no entry of `a` holds.
 */
function sameEntries(a: object, b: object): boolean {
  const entries = definedEntries(a);
  if (entries.length !== definedEntries(b).length) return false;
  const other = b as Readonly<Record<string, unknown>>;
  return entries.every(([key, value]) => sameContent(value, other[key]));
}

/** An array's every entry, or an object's entries that aren't undefined. */
function definedEntries(value: object): [string, unknown][] {
  const entries = Object.entries(value);
  if (Array.isArray(value)) return entries;
  return entries.filter(([, entry]) => entry !== undefined);
}
