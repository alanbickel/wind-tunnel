import { useId } from "react";
import { sameKey } from "../../application/run-analysis/findings/finding-key";
import type {
  Finding,
  Severity,
} from "../../application/run-analysis/findings/finding";
import { SEVERITY_LABELS } from "../../application/run-analysis/findings/message-format";
import type { FindingNode } from "../../application/run-analysis/findings/order-findings";
import { Explained } from "../shared/Explained";
import { FindingDetails } from "./FindingDetails";
import type { FindingSelecting } from "./finding-selecting";
import type { FindingText } from "./finding-text";
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
  readonly text: FindingText;
  readonly selecting: FindingSelecting;
}

/**
 * A finding's severity and summary, a button that selects it, with an
 * explain-this control that opens its reasons, fixes, and Learn more, and
 * its causes beneath it. If its component has gone from the project since
 * the run, a line under it says so, from a live region that's on the page
 * from the start, so a screen reader announces it.
 */
export function FindingItem({
  node,
  number,
  text,
  selecting,
}: FindingItemProps) {
  const { finding } = node;
  // "About finding 1" alone doesn't say which finding; its summary does.
  const summaryId = useId();
  const chosen = isChosen(selecting, finding);
  const summary = { finding, number, text, selecting, chosen };
  return (
    <li className={styles.item}>
      <Explained
        title={<SelectSummary id={summaryId} {...summary} />}
        subject={`finding ${number}`}
        describedBy={summaryId}
      >
        <FindingDetails finding={finding} text={text} />
      </Explained>
      <GoneLine {...summary} />
      <FindingList
        nodes={node.causes}
        prefix={`${number}.`}
        text={text}
        selecting={selecting}
      />
    </li>
  );
}

export interface FindingListProps {
  readonly nodes: readonly FindingNode[];
  /** Put before each one's number: "" at the top, "1." beneath finding 1. */
  readonly prefix: string;
  readonly text: FindingText;
  readonly selecting: FindingSelecting;
}

/** Findings in `findRun`'s order; nothing if there are none. */
export function FindingList({
  nodes,
  prefix,
  text,
  selecting,
}: FindingListProps) {
  if (nodes.length === 0) return null;
  return (
    <ol className={styles.list}>
      {nodes.map((node, i) => {
        const number = `${prefix}${String(i + 1)}`;
        return (
          <FindingItem
            key={number}
            node={node}
            number={number}
            text={text}
            selecting={selecting}
          />
        );
      })}
    </ol>
  );
}

interface SummaryProps extends Pick<
  FindingItemProps,
  "number" | "text" | "selecting"
> {
  readonly finding: Finding;
  /** Whether this is the selected finding. */
  readonly chosen: boolean;
}

interface SelectSummaryProps extends SummaryProps {
  readonly id: string;
}

/** The summary, as a button that selects the finding. */
function SelectSummary(props: SelectSummaryProps) {
  const { id, finding, number, text, selecting, chosen } = props;
  return (
    <p id={id} className={styles.summary}>
      <button
        type="button"
        className={styles.select}
        aria-current={chosen || undefined}
        onClick={() => {
          selecting.onSelect(finding.key);
        }}
      >
        {number}.{" "}
        <span className={SEVERITY_CLASSES[finding.severity]}>
          {SEVERITY_LABELS[finding.severity]}:
        </span>{" "}
        {text.statement(finding.summary)}
      </button>
    </p>
  );
}

/**
 * Says the selected finding's component has gone from the project. Always
 * on the page, empty otherwise, so a screen reader announces it.
 */
function GoneLine({ finding, text, selecting, chosen }: SummaryProps) {
  const gone = chosen && selecting.isGone(finding.key);
  const name = text.componentName(finding.key.componentId);
  return (
    <p role="status" className={styles.gone}>
      {gone && `${name} isn't in the project any more.`}
    </p>
  );
}

/** Whether `finding` is the selected one. */
function isChosen({ selected }: FindingSelecting, { key }: Finding): boolean {
  return selected !== undefined && sameKey(selected, key);
}
