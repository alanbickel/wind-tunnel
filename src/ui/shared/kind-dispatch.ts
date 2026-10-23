import type { KindHandlers, Kinded } from "../../domain/shared/kind-handlers";

/**
 * Calls the handler for `member`'s kind and returns its result. The UI's
 * twin of the domain's `handleKind`, which `ui/` can't import at run time;
 * the handlers are typed with the domain's `KindHandlers`, so a new kind
 * stops them compiling until it has one (CONTRIBUTING rule 4).
 */
export function dispatchKind<U extends Kinded, R>(
  handlers: KindHandlers<U, R>,
  member: U,
): R {
  const kind: U["kind"] = member.kind;
  // TypeScript can't link `kind` to the handler's parameter type, but
  // `KindHandlers` maps each kind to a handler for exactly that member.
  const handler = handlers[kind] as (member: U) => R;
  return handler(member);
}
