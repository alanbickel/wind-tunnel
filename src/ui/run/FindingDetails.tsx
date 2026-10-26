import type { ReactNode } from "react";
import type {
  Claim,
  Finding,
  Fix,
} from "../../application/run-analysis/findings/finding";
import { at, say } from "../../application/run-analysis/findings/message";
import {
  CLAIM_LABELS,
  SCOPE_LABELS,
} from "../../application/run-analysis/findings/message-format";
import type { Statement } from "../../application/run-analysis/findings/phrase";
import type { FindingText } from "./finding-text";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { dispatchKind } from "../shared/kind-dispatch";
import { repositoryFileUrl } from "../shared/repository-links";
import styles from "./FindingDetails.module.css";

/** Where a finding's Learn more anchors point. */
const LEARN_MORE_DOC = "docs/learning/aws-did-you-know.md";

export interface FindingDetailsProps {
  readonly finding: Finding;
  readonly text: FindingText;
}

/**
 * What a finding's explain-this control opens: why, in causal order; when
 * its cause began; what would fix it, with the evidence for each fix; and
 * where to learn more. The CLI lists the same, in the same order.
 */
export function FindingDetails({ finding, text }: FindingDetailsProps) {
  return (
    <>
      <Reasons reasons={finding.reasons} text={text} />
      <CauseBegan finding={finding} text={text} />
      <Fixes fixes={finding.fixes} text={text} />
      <LearnMore anchor={finding.learnMore} />
    </>
  );
}

interface ReasonsProps {
  readonly reasons: readonly Statement[];
  readonly text: FindingText;
}

function Reasons({ reasons, text }: ReasonsProps) {
  if (reasons.length === 0) return null;
  return (
    <ul className={styles.list}>
      {reasons.map((reason, i) => (
        <li key={i}>{text.statement(reason)}</li>
      ))}
    </ul>
  );
}

interface CauseBeganProps {
  readonly finding: Finding;
  readonly text: FindingText;
}

function CauseBegan({ finding: { causeWindow }, text }: CauseBeganProps) {
  if (causeWindow === undefined) return null;
  return <p>{text.message(say`Cause began at ${at(causeWindow.fromMs)}.`)}</p>;
}

interface FixesProps {
  readonly fixes: readonly Fix[];
  readonly text: FindingText;
}

function Fixes({ fixes, text }: FixesProps) {
  if (fixes.length === 0) return null;
  return (
    <>
      <p className={styles.listHeading}>Fixes:</p>
      <ul className={styles.list}>
        {fixes.map((fix, i) => (
          <li key={i}>
            <strong>{SCOPE_LABELS[fix.scope]}:</strong>{" "}
            {text.message(fix.message)} (
            <ClaimText claim={fix.claim} />
            {fidelityText(fix)})
          </li>
        ))}
      </ul>
    </>
  );
}

interface ClaimTextProps {
  readonly claim: Claim;
}

/** The fix's evidence: a page's link, a test's name, or a labeled guess. */
function ClaimText({ claim }: ClaimTextProps) {
  return dispatchKind(CLAIM_VIEWS, claim);
}

const CLAIM_VIEWS: KindHandlers<Claim, ReactNode> = {
  documented: ({ title, url }) => (
    <>
      {CLAIM_LABELS.documented}: <a href={url}>{title}</a>
    </>
  ),
  observed: ({ file, test }) => (
    <>
      {CLAIM_LABELS.observed}: <a href={repositoryFileUrl(file)}>{file}</a>,
      &ldquo;{test}&rdquo;
    </>
  ),
  assumption: () => CLAIM_LABELS.assumption,
};

/** "; fidelity SQS-3, SQS-4", where a difference from AWS could matter. */
function fidelityText({ fidelityIds }: Fix): string {
  if (fidelityIds.length === 0) return "";
  return `; fidelity ${fidelityIds.join(", ")}`;
}

interface LearnMoreProps {
  readonly anchor: string | undefined;
}

function LearnMore({ anchor }: LearnMoreProps) {
  if (anchor === undefined) return null;
  return (
    <p>
      <a href={repositoryFileUrl(LEARN_MORE_DOC, anchor)}>
        Learn more: AWS did you know
      </a>
    </p>
  );
}
