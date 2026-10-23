import { useCallback, useId, type ReactNode } from "react";
import type { RunFindings } from "../../application/run-analysis/findings/find-run";
import type { Phrasebook } from "../../application/run-analysis/findings/phrasebook";
import type { Statement } from "../../application/run-analysis/findings/phrase";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import { FindingList } from "./FindingItem";
import styles from "./Findings.module.css";
import { MessageText } from "./MessageText";

export interface FindingsProps {
  readonly findings: RunFindings;
  /** Words the verdict's and the findings' statements. */
  readonly phrasebook: Phrasebook;
}

/**
 * What the run means so far: the verdict, then each finding with its causes
 * beneath it, worded in the long form as the CLI words them.
 */
export function Findings({ findings, phrasebook }: FindingsProps) {
  const headingId = useId();
  const word = useCallback(
    (statement: Statement) => (
      <MessageText message={phrasebook.word(statement, "long")} />
    ),
    [phrasebook],
  );
  return (
    <section aria-labelledby={headingId} className={styles.findings}>
      <VerdictLines
        verdict={findings.verdict}
        headingId={headingId}
        word={word}
      />
      <h4 className={styles.heading}>Findings</h4>
      {findings.findings.length === 0 ? (
        <p className={styles.none}>None.</p>
      ) : (
        <FindingList nodes={findings.findings} prefix="" word={word} />
      )}
    </section>
  );
}

interface VerdictLinesProps {
  readonly verdict: Verdict;
  /** The section is named by the verdict's title. */
  readonly headingId: string;
  readonly word: (statement: Statement) => ReactNode;
}

/** The title and summary, then the no-headroom and headroom lines. */
function VerdictLines({ verdict, headingId, word }: VerdictLinesProps) {
  const lines = [verdict.noHeadroomLine, verdict.headroomLine].flatMap(
    (line) => (line === undefined ? [] : [line]),
  );
  return (
    // The level marks it by color; the title says it in words too.
    <div className={styles.verdict} data-level={verdict.level}>
      <h4 id={headingId} className={styles.title}>
        {verdict.title}
      </h4>
      <p>{word(verdict.summary)}</p>
      {lines.map((line) => (
        <p key={line.kind}>{word(line)}</p>
      ))}
    </div>
  );
}
