import type { IdGenerator } from "../../application/ports/id-generator";

/**
 * `IdGenerator` that returns random (version 4) UUIDs from
 * `crypto.randomUUID()`. Works in the browser, a Worker, and Node, but the
 * browser provides it only in secure contexts (HTTPS or localhost).
 */
export class RandomUuidIds implements IdGenerator {
  newId(): string {
    return crypto.randomUUID();
  }
}
