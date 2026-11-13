/**
 * How one component did in the run so far, in the words the findings use:
 * - `refused`: it turned work away (its `rejected` is above 0).
 * - `waited`: it refused nothing, but a limit that makes work wait when full
 *   ran out at its peak.
 * - `ok`: neither.
 */
export type ComponentStatus = "refused" | "waited" | "ok";

/**
 * Each status's word. The node badge says it as it is, and the findings' two
 * `refused()` helpers (the verdict's and retries-absorbed's) build their word
 * from it. Other sentences use the verb freely, so a change here doesn't
 * reach them.
 */
export const STATUS_WORDS: Readonly<Record<ComponentStatus, string>> = {
  refused: "refused",
  waited: "waited",
  ok: "ok",
};
