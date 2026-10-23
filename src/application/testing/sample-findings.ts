import { createPhrasebook } from "../run-analysis/findings/create-phrasebook";
import type { Finding, FindingKey } from "../run-analysis/findings/finding";
import { findingKey } from "../run-analysis/findings/finding-key";
import type { Message, MessagePart } from "../run-analysis/findings/message";
import type {
  Length,
  PhraseTable,
  Statement,
} from "../run-analysis/findings/phrase";
import type { Phrasebook } from "../run-analysis/findings/phrasebook";
import type { RunSoFar } from "../run-analysis/run-so-far";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { sampleRecord } from "./sample-record";

/** A note with nothing in it; override the fields a test needs. */
export function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    key: sampleKey("sample"),
    severity: "note",
    limitNames: [],
    window: { fromMs: 0, toMs: 1_000 },
    causeWindow: undefined,
    summary: said([]),
    reasons: [],
    evidence: [],
    fixes: [],
    learnMore: undefined,
    explains: undefined,
    causedBy: [],
    affected: undefined,
    ...overrides,
  };
}

/** A key of the given kind at `fn`, the sample's function. */
export function sampleKey(kind: string): FindingKey {
  return findingKey({ kind, componentId: "fn" });
}

/** `sampleRecord`'s run of its 5 s `steady` workload, as far as `snapshots`. */
export function sampleRun(snapshots: readonly MetricsSnapshot[]): RunSoFar {
  return { project: sampleRecord.project, workloadId: "steady", snapshots };
}

/**
 * A statement that carries its own words, for tests of what lays findings
 * out rather than what they say. `saidPhrasebook` words it.
 */
export interface SaidStatement extends Statement {
  readonly kind: "said";
  readonly message: Message;
}

export function said(message: Message): SaidStatement {
  return { kind: "said", message };
}

function isSaid(statement: Statement): statement is SaidStatement {
  return statement.kind === "said" && "message" in statement;
}

/** Words a `said` statement as its message, at either length. */
export const saidPhrasebook: Phrasebook = {
  word: (statement) => {
    if (!isSaid(statement)) throw new Error(`Not said: "${statement.kind}"`);
    return statement.message;
  },
};

/**
 * Words statements with the phrases given, for `sampleRecord`'s project,
 * as `messageText` gives them: the phrase tests' view of a phrasebook.
 */
export function sampleWording(
  phrases: PhraseTable,
): (statement: Statement, length: Length) => string {
  const phrasebook = createPhrasebook({
    project: sampleRecord.project,
    detectors: [{ id: "sample", detect: () => [], phrases }],
  });
  return (statement, length) => messageText(phrasebook.word(statement, length));
}

/**
 * The message as plain text for assertions: numbers as they are (a share
 * as a fraction), components by ID, and times as "<ms>ms".
 */
export function messageText(message: Message): string {
  return message.map((part) => handleKind(PART_TEXT, part)).join("");
}

const PART_TEXT: KindHandlers<MessagePart, string> = {
  text: ({ text }) => text,
  number: ({ value }) => String(value),
  component: ({ componentId }) => componentId,
  time: ({ atMs }) => `${String(atMs)}ms`,
};
