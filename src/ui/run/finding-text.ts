import type { ReactNode } from "react";
import type { Message } from "../../application/run-analysis/findings/message";
import type { Statement } from "../../application/run-analysis/findings/phrase";

/**
 * How the run panel shows a finding's words, with its components by name:
 * a statement in its long form, and a message that's already worded, such
 * as a fix.
 */
export interface FindingText {
  readonly statement: (statement: Statement) => ReactNode;
  readonly message: (message: Message) => ReactNode;
}
