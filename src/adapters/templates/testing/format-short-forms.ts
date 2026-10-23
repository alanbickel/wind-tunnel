import type { RunFindings } from "../../../application/run-analysis/findings/find-run";
import type { FindingNode } from "../../../application/run-analysis/findings/order-findings";
import type { Statement } from "../../../application/run-analysis/findings/phrase";
import type { Phrasebook } from "../../../application/run-analysis/findings/phrasebook";
import { formatMessage } from "../../../application/run-analysis/findings/message-format";

// Every statement of a run in its short form, laid out as the CLI lays out
// the long forms, so a reviewer reads each short form once (#77). The run
// panel quotes a finding's short form after "but", so each line should read
// that way.

/** The verdict's lines, then each finding with its causes beneath it. */
export function formatShortForms(
  { verdict, findings }: RunFindings,
  phrasebook: Phrasebook,
): string {
  const short = (s: Statement): string =>
    formatMessage(phrasebook.word(s, "short"));
  const labeled: readonly (readonly [string, Statement | undefined])[] = [
    ["Verdict", verdict.summary],
    ["No headroom", verdict.noHeadroomLine],
    ["Closest to failing", verdict.headroomLine],
  ];
  const lines = labeled.flatMap(([label, statement]) =>
    statement === undefined ? [] : [`${label}: ${short(statement)}`],
  );
  const nodes = findings.map((node, i) =>
    nodeLines(node, { number: String(i + 1), indent: "", short }),
  );
  return [lines.join("\n"), ...nodes].join("\n\n") + "\n";
}

/** Words a statement in its short form, as plain text. */
type Short = (statement: Statement) => string;

/** A finding's number, e.g. "1.2", how far it's indented, and the wording. */
interface NodeContext {
  readonly number: string;
  readonly indent: string;
  readonly short: Short;
}

function nodeLines(node: FindingNode, context: NodeContext): string {
  const { number, indent, short } = context;
  const inner = `${indent}${" ".repeat(number.length + 2)}`;
  const { summary, reasons } = node.finding;
  const causes = node.causes.map((cause, i) =>
    nodeLines(cause, {
      ...context,
      number: `${number}.${String(i + 1)}`,
      indent: inner,
    }),
  );
  return [
    `${indent}${number}. ${short(summary)}`,
    ...reasons.map((r) => `${inner}- ${short(r)}`),
    ...causes,
  ].join("\n");
}
