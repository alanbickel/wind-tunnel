import type {
  Claim,
  Finding,
  Fix,
} from "../../application/run-analysis/findings/finding";
import type { RunFindings } from "../../application/run-analysis/findings/find-run";
import type { ComponentNames } from "../../application/run-analysis/component-names";
import type { FindingsWording } from "../../application/run-analysis/findings/findings-wording";
import {
  CLAIM_LABELS,
  formatMessage,
  SCOPE_LABELS,
  SEVERITY_LABELS,
} from "../../application/run-analysis/findings/message-format";
import type { FindingNode } from "../../application/run-analysis/findings/order-findings";
import type { Statement } from "../../application/run-analysis/findings/phrase";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import {
  handleKind,
  lookup,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { seconds } from "../../application/run-analysis/number-format";

// The verdict and findings as plain text. The sentences come from the
// phrasebook in `application/run-analysis/findings/`, in their long form;
// only the formatting is here, so the CLI and the run panel say the same
// thing (ADR-0015).

/**
 * The verdict: its title and summary, then its no-headroom and headroom
 * lines, if it has them.
 */
export function formatVerdict(
  verdict: Verdict,
  wording: FindingsWording,
): string {
  const say = sayer(wording);
  const lines = [verdict.noHeadroomLine, verdict.headroomLine].flatMap(
    (line) => (line === undefined ? [] : [say(line)]),
  );
  return [`${verdict.title}. ${say(verdict.summary)}`, ...lines].join("\n");
}

/** Each top-level finding, numbered, with its causes nested beneath it. */
export function formatFindings(
  { findings }: RunFindings,
  wording: FindingsWording,
): string {
  if (findings.length === 0) return "None.";
  const say = sayer(wording);
  const { nameOf } = wording;
  return findings
    .map((node, i) =>
      formatNode(node, { number: String(i + 1), indent: "", say, nameOf }),
    )
    .join("\n\n");
}

/** Words a statement in its long form, as plain text. */
type Sayer = (statement: Statement) => string;

function sayer({ phrasebook, nameOf }: FindingsWording): Sayer {
  return (statement) =>
    formatMessage(phrasebook.word(statement, "long"), nameOf);
}

/**
 * A finding's number in the list, e.g. "1.2", how far it's indented, and
 * how to word it and the components in its fixes.
 */
interface NodeContext {
  readonly number: string;
  readonly indent: string;
  readonly say: Sayer;
  readonly nameOf: ComponentNames;
}

function formatNode(node: FindingNode, context: NodeContext): string {
  const { number, indent } = context;
  const inner = {
    ...context,
    indent: `${indent}${" ".repeat(number.length + 2)}`,
  };
  const causes = node.causes.map((cause, i) =>
    formatNode(cause, { ...inner, number: `${number}.${String(i + 1)}` }),
  );
  return [
    `${indent}${number}. ${findingLines(node.finding, inner)}`,
    ...causes,
  ].join("\n");
}

/** The finding's lines; every line after the first starts with `indent`. */
function findingLines(finding: Finding, context: NodeContext): string {
  const { indent, say } = context;
  const lines = [
    `${lookup(SEVERITY_LABELS, finding.severity)}: ${say(finding.summary)}`,
    ...finding.reasons.map((r) => `${indent}- ${say(r)}`),
    ...causeLine(finding, indent),
    ...fixLines(finding.fixes, context),
    ...learnMoreLine(finding, indent),
  ];
  return lines.join("\n");
}

function causeLine({ causeWindow }: Finding, indent: string): string[] {
  if (causeWindow === undefined) return [];
  return [`${indent}Cause began at ${seconds(causeWindow.fromMs)} s.`];
}

function fixLines(
  fixes: readonly Fix[],
  { indent, nameOf }: NodeContext,
): string[] {
  if (fixes.length === 0) return [];
  return [
    `${indent}Fixes:`,
    ...fixes.map(
      (fix) =>
        `${indent}- ${lookup(SCOPE_LABELS, fix.scope)}: ${formatMessage(fix.message, nameOf)} (${claimText(fix)})`,
    ),
  ];
}

const CLAIMS: KindHandlers<Claim, string> = {
  documented: ({ title, url }) =>
    `${CLAIM_LABELS.documented}: ${title}, ${url}`,
  observed: ({ file, test }) => `${CLAIM_LABELS.observed}: ${file}, "${test}"`,
  assumption: () => CLAIM_LABELS.assumption,
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
