import type {
  Claim,
  Finding,
  Fix,
  FixScope,
  Severity,
} from "../../application/run-analysis/findings/finding";
import type { RunFindings } from "../../application/run-analysis/findings/find-run";
import type {
  Message,
  MessagePart,
  NumberUnit,
} from "../../application/run-analysis/findings/message";
import type { FindingNode } from "../../application/run-analysis/findings/order-findings";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import {
  handleKind,
  lookup,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { count, seconds, shareDown } from "./text-format";

// The verdict and findings as plain text. The sentences come from
// `application/run-analysis/findings/`; only the formatting is here, so the
// CLI and the run panel say the same thing (ADR-0015).

/** The verdict: its title and summary, then its headroom line, if any. */
export function formatVerdict(verdict: Verdict): string {
  const lines = [`${verdict.title}. ${formatMessage(verdict.summary)}`];
  if (verdict.headroomLine !== undefined) {
    lines.push(formatMessage(verdict.headroomLine));
  }
  return lines.join("\n");
}

/** Each top-level finding, numbered, with its causes nested beneath it. */
export function formatFindings({ findings }: RunFindings): string {
  if (findings.length === 0) return "None.";
  return findings
    .map((node, i) => formatNode(node, { number: String(i + 1), indent: "" }))
    .join("\n\n");
}

/** A finding's number in the list, e.g. "1.2", and how far it's indented. */
interface NodePosition {
  readonly number: string;
  readonly indent: string;
}

function formatNode(node: FindingNode, position: NodePosition): string {
  const { number, indent } = position;
  const inner = `${indent}${" ".repeat(number.length + 2)}`;
  const causes = node.causes.map((cause, i) =>
    formatNode(cause, { number: `${number}.${String(i + 1)}`, indent: inner }),
  );
  return [
    `${indent}${number}. ${findingLines(node.finding, inner)}`,
    ...causes,
  ].join("\n");
}

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  failure: "Failure",
  warning: "Warning",
  note: "Note",
};

/** The finding's lines; every line after the first starts with `indent`. */
function findingLines(finding: Finding, indent: string): string {
  const lines = [
    `${lookup(SEVERITY_LABELS, finding.severity)}: ${formatMessage(finding.summary)}`,
    ...finding.reasons.map((r) => `${indent}- ${formatMessage(r)}`),
    ...causeLine(finding, indent),
    ...fixLines(finding.fixes, indent),
    ...learnMoreLine(finding, indent),
  ];
  return lines.join("\n");
}

function causeLine({ causeWindow }: Finding, indent: string): string[] {
  if (causeWindow === undefined) return [];
  return [`${indent}Cause began at ${seconds(causeWindow.fromMs)} s.`];
}

const SCOPE_LABELS: Readonly<Record<FixScope, string>> = {
  "wind-tunnel": "In Wind Tunnel",
  aws: "In AWS",
};

function fixLines(fixes: readonly Fix[], indent: string): string[] {
  if (fixes.length === 0) return [];
  return [
    `${indent}Fixes:`,
    ...fixes.map(
      (fix) =>
        `${indent}- ${lookup(SCOPE_LABELS, fix.scope)}: ${formatMessage(fix.message)} (${claimText(fix)})`,
    ),
  ];
}

const CLAIMS: KindHandlers<Claim, string> = {
  documented: ({ title, url }) => `Documented: ${title}, ${url}`,
  observed: ({ file, test }) => `Observed: ${file}, "${test}"`,
  assumption: () => "Assumption",
};

function claimText(fix: Fix): string {
  const fidelity =
    fix.fidelityIds.length === 0
      ? ""
      : `; fidelity ${fix.fidelityIds.join(", ")}`;
  return `${handleKind(CLAIMS, fix.claim)}${fidelity}`;
}

function learnMoreLine({ learnMore }: Finding, indent: string): string[] {
  if (learnMore === undefined) return [];
  return [
    `${indent}Learn more: docs/learning/aws-did-you-know.md#${learnMore}`,
  ];
}

/** The message as plain text: components by ID, times in seconds. */
export function formatMessage(message: Message): string {
  return message.map((part) => handleKind(PARTS, part)).join("");
}

const PARTS: KindHandlers<MessagePart, string> = {
  text: ({ text }) => text,
  number: ({ value, unit }) => lookup(NUMBERS, unit)(value),
  component: ({ componentId }) => componentId,
  time: ({ atMs }) => `${seconds(atMs)} s`,
};

const NUMBERS: Readonly<Record<NumberUnit, (value: number) => string>> = {
  count: (value) => count(Math.round(value)),
  share: (value) => shareDown(value),
  ms: durationText,
};

/** "114 ms" under a second; "6.2 s" or "29 s" from a second up. */
function durationText(valueMs: number): string {
  if (valueMs < 1000) return `${count(Math.round(valueMs))} ms`;
  return `${seconds(valueMs)} s`;
}
