import type { Message } from "./message";
import type { Length, Statement } from "./phrase";

/**
 * Words the statements of one project's findings and verdict, at the length
 * the consumer asks for: the CLI and the findings list ask for `long`, and
 * the verdict's line quotes a finding's `short`. Built by
 * `createPhrasebook`.
 */
export interface Phrasebook {
  /** Throws if no detector, and not the verdict, registered the kind. */
  word(statement: Statement, length: Length): Message;
}
