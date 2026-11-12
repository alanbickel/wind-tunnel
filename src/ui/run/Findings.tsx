import { useId, useMemo } from "react";
import type { RunFindings } from "../../application/run-analysis/findings/find-run";
import type { FindingsWording } from "../../application/run-analysis/findings/findings-wording";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import type { KeyboardEvent } from "react";
import type { FindingSelecting } from "./finding-selecting";
import type { FindingText } from "./finding-text";
import { FindingList } from "./FindingItem";
import styles from "./Findings.module.css";
import { MessageText } from "./MessageText";

export interface FindingsProps {
  readonly findings: RunFindings;
  /** Words the verdict's and the findings' statements, and names components. */
  readonly wording: FindingsWording;
  /** Which finding is selected, and how to select one. */
  readonly selecting: FindingSelecting;
}

/**
 * What the run means so far: the verdict, then each finding with its causes
 * beneath it, worded in the long form as the CLI words them. Each is a
 * button that selects it; Escape in the section clears the selection, once
 * an open explanation has had its own Escape.
 */
export function Findings({ findings, wording, selecting }: FindingsProps) {
  const headingId = useId();
  const text = useFindingText(wording);
  return (
    <section
      aria-labelledby={headingId}
      className={styles.findings}
      onKeyDown={(event) => {
        clearOnEscape(event, selecting);
      }}
    >
      <VerdictLines
        verdict={findings.verdict}
        headingId={headingId}
        text={text}
      />
      <h4 className={styles.heading}>Findings</h4>
      {findings.findings.length === 0 ? (
        <p className={styles.none}>None.</p>
      ) : (
        <FindingList
          nodes={findings.findings}
          prefix=""
          text={text}
          selecting={selecting}
        />
      )}
    </section>
  );
}

interface VerdictLinesProps {
  readonly verdict: Verdict;
  /** The section is named by the verdict's title. */
  readonly headingId: string;
  readonly text: FindingText;
}

/** The title and summary, then the no-headroom and headroom lines. */
function VerdictLines({ verdict, headingId, text }: VerdictLinesProps) {
  const lines = [verdict.noHeadroomLine, verdict.headroomLine].flatMap(
    (line) => (line === undefined ? [] : [line]),
  );
  return (
    // The level marks it by color; the title says it in words too.
    <div className={styles.verdict} data-level={verdict.level}>
      <h4 id={headingId} className={styles.title}>
        {verdict.title}
      </h4>
      <p>{text.statement(verdict.summary)}</p>
      {lines.map((line) => (
        <p key={line.kind}>{text.statement(line)}</p>
      ))}
    </div>
  );
}

/** Escape clears a finding's selection; it does nothing with none. */
function clearOnEscape(
  event: KeyboardEvent<HTMLElement>,
  { selected, onClear }: FindingSelecting,
): void {
  if (event.key !== "Escape" || selected === undefined) return;
  event.preventDefault();
  onClear();
}

/** How the findings' words are shown, drawn again only when the wording changes. */
function useFindingText(wording: FindingsWording): FindingText {
  return useMemo(() => {
    const { phrasebook, nameOf } = wording;
    return {
      statement: (statement) => (
        <MessageText
          message={phrasebook.word(statement, "long")}
          nameOf={nameOf}
        />
      ),
      message: (message) => <MessageText message={message} nameOf={nameOf} />,
      componentName: nameOf,
    };
  }, [wording]);
}
