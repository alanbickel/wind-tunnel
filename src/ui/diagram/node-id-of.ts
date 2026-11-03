/** The id of the React Flow box an event happened in, if it happened in one. */
export function nodeIdOf(target: EventTarget): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const id = target.closest(".react-flow__node")?.getAttribute("data-id");
  return id ?? undefined;
}
