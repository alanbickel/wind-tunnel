import type { Message } from "./message";

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

/**
 * The words for the project's own IDs, at the length being worded: a
 * component type's rejection reasons and limits, as the type registers
 * them, and the workflows' names. An ID with no words is printed as it is,
 * e.g. `too-many-connections` or `queryWorkers`.
 */
export interface Vocabulary {
  reason(input: ComponentWordInput): string;
  limit(input: ComponentWordInput): string;
  workflow(workflowId: string): string;
}

/** A reason or a limit of one component, by ID. */
export interface ComponentWordInput {
  readonly componentId: string;
  /** The reason, e.g. `"throttled"`, or the limit's name, e.g. `"readUnits"`. */
  readonly id: string;
}

/**
 * Words the limits of one component, so a phrase that names several needs
 * no input object for each: `limitsOf(vocabulary, "orders-db")("queryWorkers")`.
 */
export function limitsOf(
  vocabulary: Vocabulary,
  componentId: string,
): (name: string) => string {
  return (id) => vocabulary.limit({ componentId, id });
}
