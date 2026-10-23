import type { Message } from "./message";
import type { Vocabulary } from "./vocabulary";

/**
 * What a finding or the verdict says, as a value rather than words: a kind,
 * and the numbers, components, times, and IDs the sentence quotes. A
 * consumer that wants the meaning (a test, a filter) reads the fields; the
 * phrasebook words it. Each detector's file of phrases declares its own
 * statements, extending this.
 */
export interface Statement {
  /** Which phrase words it, e.g. `"requests-failed"`. Unique across detectors. */
  readonly kind: string;
}

/**
 * - `long`: a whole sentence, with its closing period, as the CLI and the
 *   findings list say it;
 * - `short`: a clause with no closing period that reads after "but", as the
 *   verdict's line quotes a finding.
 */
export type Length = "long" | "short";

/**
 * How one kind of statement is worded, at both lengths. Both are required,
 * with no fallback from one to the other, so a consumer can pick either.
 *
 * Methods rather than function properties, so a phrase for one statement
 * fits in a `PhraseTable` of every statement: the phrasebook only ever
 * hands a phrase the statements of its own kind.
 */
export interface Phrase<S extends Statement> {
  long(statement: S, vocabulary: Vocabulary): Message;
  short(statement: S, vocabulary: Vocabulary): Message;
}

/** A phrase for every kind of statement in `S`, keyed by kind. */
export type Phrases<S extends Statement> = {
  readonly [K in S["kind"]]: Phrase<Extract<S, { readonly kind: K }>>;
};

/** Phrases keyed by kind, as a detector registers them. */
export type PhraseTable = Readonly<Record<string, Phrase<Statement>>>;
