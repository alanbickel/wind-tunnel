import type {
  Length,
  Phrases,
  PhraseTable,
  Statement,
} from "../run-analysis/findings/phrase";
import { sampleWording } from "./sample-findings";

/** A statement, and its words at each length, as `messageText` gives them. */
export interface PhraseCase<S extends Statement> {
  /** What the case is, for its violations. */
  readonly name: string;
  readonly statement: S;
  readonly long: string;
  readonly short: string;
}

/** A table of phrases, and the cases that word every kind it registers. */
export interface CheckPhrasesInput<S extends Statement> {
  readonly phrases: Phrases<S>;
  readonly cases: readonly PhraseCase<S>[];
  /**
   * Tables spread into `phrases` whose own tests cover them, such as
   * limit-refused's in failed-requests'.
   */
  readonly shared?: readonly PhraseTable[];
}

/**
 * Words each case with the phrases, for `sampleRecord`'s project, at both
 * lengths, and lists every way the phrases break their promises: a form
 * worded other than the case says, a long form without its closing period
 * or a short form with one (it reads after "but"), and a kind the table
 * registers itself with no case. Empty when they keep them all.
 */
export function checkPhrases<S extends Statement>(
  input: CheckPhrasesInput<S>,
): string[] {
  const word = sampleWording(input.phrases);
  return [
    ...input.cases.flatMap((c) => [
      ...wordingViolations(c, (length) => word(c.statement, length)),
      ...periodViolations(c),
    ]),
    ...uncoveredKinds(input).map((kind) => `"${kind}" has no case`),
  ];
}

function wordingViolations<S extends Statement>(
  c: PhraseCase<S>,
  word: (length: Length) => string,
): string[] {
  const lengths: readonly Length[] = ["long", "short"];
  return lengths.flatMap((length) => {
    const worded = word(length);
    if (worded === c[length]) return [];
    return [`${c.name}, ${length}: worded "${worded}", not "${c[length]}"`];
  });
}

function periodViolations<S extends Statement>(c: PhraseCase<S>): string[] {
  return [
    ...(c.long.endsWith(".") ? [] : [`${c.name}: the long form has no period`]),
    ...(c.short.endsWith(".")
      ? [`${c.name}: the short form has a period`]
      : []),
  ];
}

/** The kinds the table registers itself that no case words. */
function uncoveredKinds<S extends Statement>({
  phrases,
  cases,
  shared = [],
}: CheckPhrasesInput<S>): string[] {
  const sharedKinds = new Set(shared.flatMap((t) => Object.keys(t)));
  const covered = new Set<string>(cases.map((c) => c.statement.kind));
  return Object.keys(phrases).filter(
    (kind) => !sharedKinds.has(kind) && !covered.has(kind),
  );
}
