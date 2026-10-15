/**
 * Whether the browser will keep the user's projects under storage pressure.
 * - `persisted`: kept until the user clears site data.
 * - `best-effort`: may be evicted, along with everything else the site
 *   stores, if the device runs low on space.
 * - `unsupported`: the browser can't say (e.g. no Storage API), so treat it
 *   as best-effort.
 */
export type PersistenceStatus = "persisted" | "best-effort" | "unsupported";

/**
 * Asks the browser to exempt the site's storage from eviction (ADR-0004).
 * Firefox asks the user; Chrome and Safari decide from how the user has used
 * the site. Ask once the user has work to lose, such as after creating their
 * first project, not at startup. When the answer isn't `persisted`, point the
 * user to export.
 */
export interface StoragePersistence {
  /** Resolves `persisted` at once, with no prompt, if it's already granted. */
  request(): Promise<PersistenceStatus>;
}
