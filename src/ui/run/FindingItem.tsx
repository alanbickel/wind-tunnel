import { useId, type ReactNode } from "react";
import type { Severity } from "../../application/run-analysis/findings/finding";
import { SEVERITY_LABELS } from "../../application/run-analysis/findings/message-format";
import type { FindingNode } from "../../application/run-analysis/findings/order-findings";
import type { Statement } from "../../application/run-analysis/findings/phrase";
import { Explained } from "../shared/Explained";
import { FindingDetails } from "./FindingDetails";
import styles from "./FindingItem.module.css";

/** Each severity's mark; its label says it in words too. */
const SEVERITY_CLASSES: Readonly<Record<Severity, string | undefined>> = {
  failure: styles.failure,
  warning: styles.warning,
  note: styles.note,
};

export interface FindingItemProps {
  readonly node: FindingNode;
  /** Its place in the list, as the CLI numbers it, e.g. "1.2". */
  readonly number: string;
  /** Words a statement in its long form. */
  readonly word: (statement: Statement) => ReactNode;
}

/**
 * A finding's severity and summary, with an explain-this control that
 * opens its reasons, fixes, and Learn more, and its causes beneath it.
 */
export function FindingItem({ node, number, word }: FindingItemProps) {
  const { finding } = node;
  // "About finding 1" alone doesn't say which finding; its summary does.
  const summaryId = useId();
  return (
    <li className={styles.item}>
      <Explained
        title={
          <p id={summaryId} className={styles.summary}>
            {number}.{" "}
            <span className={SEVERITY_CLASSES[finding.severity]}>
              {SEVERITY_LABELS[finding.severity]}:
            </span>{" "}
            {word(finding.summary)}
          </p>
        }
        subject={`finding ${number}`}
        describedBy={summaryId}
      >
        <FindingDetails finding={finding} word={word} />
      </Explained>
      <FindingList nodes={node.causes} prefix={`${number}.`} word={word} />
    </li>
  );
}

export interface FindingListProps {
  readonly nodes: readonly FindingNode[];
  /** Put before each one's number: "" at the top, "1." beneath finding 1. */
  readonly prefix: string;
  readonly word: FindingItemProps["word"];
}

/** Findings in `findRun`'s order; nothing if there are none. */
export function FindingList({ nodes, prefix, word }: FindingListProps) {
  if (nodes.length === 0) return null;
  return (
    <ol className={styles.list}>
      {nodes.map((node, i) => {
        const number = `${prefix}${String(i + 1)}`;
        return (
          <FindingItem key={number} node={node} number={number} word={word} />
        );
      })}
    </ol>
  );
}
