/** A member of a union tagged by `status`, as use case results are. */
export interface Statused {
  readonly status: string;
}

/**
 * One handler per member of the union `U`, keyed by `status`; each gets its
 * own member's fields. A new status stops every `StatusHandlers<U, R>`
 * compiling until it has a handler (CONTRIBUTING rule 4). The UI's twin of
 * the domain's `KindHandlers`, which `ui/` can't import at run time.
 */
export type StatusHandlers<U extends Statused, R> = {
  readonly [S in U["status"]]: (
    member: Extract<U, { readonly status: S }>,
  ) => R;
};

/** Calls the handler for `member`'s status and returns its result. */
export function handleStatus<U extends Statused, R>(
  handlers: StatusHandlers<U, R>,
  member: U,
): R {
  const status: U["status"] = member.status;
  // TypeScript can't link `status` to the handler's parameter type, but
  // `StatusHandlers` maps each status to a handler for exactly that member.
  const handler = handlers[status] as (member: U) => R;
  return handler(member);
}
