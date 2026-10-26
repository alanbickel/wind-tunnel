/** A config's value at `key`, or undefined if there's none. */
export function valueAt(config: unknown, key: string): unknown {
  if (typeof config !== "object" || config === null) return undefined;
  return Object.hasOwn(config, key)
    ? (config as Record<string, unknown>)[key]
    : undefined;
}
