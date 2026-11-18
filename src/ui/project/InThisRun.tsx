import { useId, useMemo } from "react";
import {
  componentInRun,
  type ComponentInRun,
  type ComponentRan,
} from "../../application/run-analysis/component-in-run";
import type { Finding } from "../../application/run-analysis/findings/finding";
import type { FindingsWording } from "../../application/run-analysis/findings/findings-wording";
import { SEVERITY_LABELS } from "../../application/run-analysis/findings/message-format";
import { StatusBadge } from "../diagram/StatusBadge";
import { MessageText } from "../run/MessageText";
import { RunColumn } from "../run/RunLines";
import type { RunMeaning } from "../run/useRunFindings";
import { Button } from "../shared/Button";
import styles from "./InThisRun.module.css";

/** The run on screen, as a component's details read it. */
export interface ThisRun {
  /** What the run means so far. */
  readonly meaning: RunMeaning;
  /** Whether the run is of an earlier version of the project. */
  readonly outOfDate: boolean;
  /** Whether the run is still going. */
  readonly going: boolean;
  /** Selects the run, as the verdict does (UX design §5, rule 4). */
  readonly onSelectRun: () => void;
}

export interface InThisRunProps {
  readonly componentId: string;
  /** The component's name now, for one the run didn't have. */
  readonly name: string;
  readonly thisRun: ThisRun;
}

/**
 * A component's part of the run on screen, at the end of its details (UX
 * design §9): the out-of-date line, as the run's explanation opens with
 * it; its status, as its badge draws it, with what it refused; the
 * findings that name it, worded as the explanation words them, as plain
 * text; and "See the run", which selects the run. A component added since
 * the run says it wasn't in it.
 */
export function InThisRun({ componentId, name, thisRun }: InThisRunProps) {
  const headingId = useId();
  const { outOfDate, onSelectRun } = thisRun;
  const part = useComponentInRun(componentId, thisRun);
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h5 id={headingId} className={styles.heading}>
        In this run
      </h5>
      <RunColumn outOfDate={outOfDate}>
        <div className={styles.body}>
          <Part part={part} name={name} {...thisRun} />
          <p className={styles.line}>
            <Button variant="link" onClick={onSelectRun}>
              See the run
            </Button>
          </p>
        </div>
      </RunColumn>
    </section>
  );
}

/** The component's part of the run, found again only when the run or the component changes. */
function useComponentInRun(
  componentId: string,
  { meaning, going }: ThisRun,
): ComponentInRun {
  return useMemo(
    () =>
      componentInRun({
        run: meaning.run,
        findings: meaning.findings,
        componentId,
        going,
      }),
    [meaning, componentId, going],
  );
}

interface PartProps extends ThisRun {
  readonly part: ComponentInRun;
  readonly name: string;
}

/** The status and findings, or that it wasn't in the run. */
function Part({ part, name, ...thisRun }: PartProps) {
  if (part.kind === "not-in-run") {
    return (
      <p className={styles.line}>
        {name} wasn&apos;t in this run: it was added since.
      </p>
    );
  }
  return <Ran part={part} {...thisRun} />;
}

interface RanProps extends ThisRun {
  readonly part: ComponentRan;
}

/** Its status, as a badge, then the findings that name it. */
function Ran({ part, outOfDate, going, meaning }: RanProps) {
  const { status, statusText, findings } = part;
  return (
    <>
      <p className={styles.line}>
        <StatusBadge status={{ kind: status, word: statusText, outOfDate }} />
      </p>
      <Findings findings={findings} going={going} wording={meaning.wording} />
    </>
  );
}

interface FindingsProps {
  readonly findings: readonly Finding[];
  readonly going: boolean;
  readonly wording: FindingsWording;
}

/**
 * Each finding's severity and summary, in the long form, as plain text:
 * selecting one would put the run's explanation in place of these
 * details. While the run goes there are none yet.
 */
function Findings({ findings, going, wording }: FindingsProps) {
  if (going) {
    return <p className={styles.line}>Its findings show when the run ends.</p>;
  }
  if (findings.length === 0) {
    return <p className={styles.line}>No finding names it.</p>;
  }
  return (
    <ul aria-label="Findings that name it" className={styles.findings}>
      {findings.map((finding, i) => (
        <li key={i}>
          {SEVERITY_LABELS[finding.severity]}:{" "}
          <MessageText
            message={wording.phrasebook.word(finding.summary, "long")}
            nameOf={wording.nameOf}
          />
        </li>
      ))}
    </ul>
  );
}
