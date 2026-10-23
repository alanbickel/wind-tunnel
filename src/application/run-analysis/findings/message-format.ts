import {
  handleKind,
  lookup,
  type KindHandlers,
} from "../../../domain/shared/kind-handlers";
import { count as countText, seconds, shareDown } from "../number-format";
import type { Claim, FixScope, Severity } from "./finding";
import type { Message, MessagePart, NumberUnit } from "./message";

// How a message's parts read as text, and the labels a finding is shown
// with, for every consumer: the CLI prints them, and the run panel sets
// components and times apart but shows the same text (ADR-0015).

/** The message as plain text: components by ID, times in seconds. */
export function formatMessage(message: Message): string {
  return message.map(partText).join("");
}

/**
 * One part as text: a count with thousands separators, a share rounded down
 * (ADR-0014), a duration in ms or s, a component by ID, a time as "14 s".
 */
export function partText(part: MessagePart): string {
  return handleKind(PARTS, part);
}

const PARTS: KindHandlers<MessagePart, string> = {
  text: ({ text }) => text,
  number: ({ value, unit }) => lookup(NUMBERS, unit)(value),
  component: ({ componentId }) => componentId,
  time: ({ atMs }) => `${seconds(atMs)} s`,
};

const NUMBERS: Readonly<Record<NumberUnit, (value: number) => string>> = {
  count: (value) => countText(Math.round(value)),
  share: (value) => shareDown(value),
  ms: durationText,
};

/** "114 ms" under a second; "6.2 s" or "29 s" from a second up. */
function durationText(valueMs: number): string {
  if (valueMs < 1000) return `${countText(Math.round(valueMs))} ms`;
  return `${seconds(valueMs)} s`;
}

/** A finding's severity as a word, so it never shows by color alone. */
export const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  failure: "Failure",
  warning: "Warning",
  note: "Note",
};

/** Where a fix is made. */
export const SCOPE_LABELS: Readonly<Record<FixScope, string>> = {
  "wind-tunnel": "In Wind Tunnel",
  aws: "In AWS",
};

/** A fix's evidence level, as `docs/design/fidelity.md` names it. */
export const CLAIM_LABELS: Readonly<Record<Claim["kind"], string>> = {
  documented: "Documented",
  observed: "Observed",
  assumption: "Assumption",
};
