/** A member of a discriminated union tagged by `kind`. */
export interface Kinded {
  readonly kind: string;
}

/**
 * One handler per member of the union `U`, keyed by `kind`. Each handler gets
 * its own member, with that member's fields. Adding a member to `U` makes
 * every `KindHandlers<U, R>` stop compiling until it has a handler, so no case
 * can be forgotten (CONTRIBUTING, rule 4).
 */
export type KindHandlers<U extends Kinded, R> = {
  readonly [K in U["kind"]]: (member: Extract<U, { readonly kind: K }>) => R;
};

/**
 * Calls the handler for `member`'s kind and returns its result. Throws if
 * there's no handler, which the types rule out unless `member` came from
 * unchecked data (e.g. a cast from parsed JSON).
 */
export function handleKind<U extends Kinded, R>(
  handlers: KindHandlers<U, R>,
  member: U,
): R {
  const kind: U["kind"] = member.kind;
  // An own-property check, so a kind such as "toString" can't find a method
  // inherited from Object.prototype.
  if (!Object.hasOwn(handlers, kind)) {
    throw new Error(`No handler for kind "${kind}"`);
  }
  // TypeScript can't link `kind` to the handler's parameter type, but
  // `KindHandlers` maps each kind to a handler for exactly that member.
  const handler = handlers[kind] as (member: U) => R;
  return handler(member);
}

/**
 * The entry for `key` in a table typed `Record<Key, Value>`, which the
 * compiler makes complete. Throws on a key outside `Key`, for the same
 * reasons as `handleKind`.
 */
export function lookup<Key extends string, Value>(
  table: Readonly<Record<Key, Value>>,
  key: Key,
): Value {
  if (!Object.hasOwn(table, key)) throw new Error(`No entry for "${key}"`);
  return table[key];
}
