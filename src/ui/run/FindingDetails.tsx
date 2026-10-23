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
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { dispatchKind } from "../shared/kind-dispatch";
import { repositoryFileUrl } from "../shared/repository-links";
import styles from "./FindingDetails.module.css";
import { MessageText } from "./MessageText";

/** Where a finding's Learn more anchors point. */
const LEARN_MORE_DOC = "docs/learning/aws-did-you-know.md";

export interface FindingDetailsProps {
  readonly finding: Finding;
  /** Words a statement in its long form. */
  readonly word: (statement: Statement) => ReactNode;
}

/**
 * What a finding's explain-this control opens: why, in causal order; when
 * its cause began; what would fix it, with the evidence for each fix; and
 * where to learn more. The CLI lists the same, in the same order.
 */
export function FindingDetails({ finding, word }: FindingDetailsProps) {
  return (
    <>
      <Reasons reasons={finding.reasons} word={word} />
      <CauseBegan finding={finding} />
      <Fixes fixes={finding.fixes} />
      <LearnMore anchor={finding.learnMore} />
    </>
  );
}

interface ReasonsProps {
  readonly reasons: readonly Statement[];
  readonly word: FindingDetailsProps["word"];
}

function Reasons({ reasons, word }: ReasonsProps) {
  if (reasons.length === 0) return null;
  return (
    <ul className={styles.list}>
      {reasons.map((reason, i) => (
        <li key={i}>{word(reason)}</li>
      ))}
    </ul>
  );
}

interface FindingProps {
  readonly finding: Finding;
}

function CauseBegan({ finding: { causeWindow } }: FindingProps) {
  if (causeWindow === undefined) return null;
  return (
    <p>
      <MessageText message={say`Cause began at ${at(causeWindow.fromMs)}.`} />
    </p>
  );
}

interface FixesProps {
  readonly fixes: readonly Fix[];
}

function Fixes({ fixes }: FixesProps) {
  if (fixes.length === 0) return null;
  return (
    <>
      <p className={styles.listHeading}>Fixes:</p>
      <ul className={styles.list}>
        {fixes.map((fix, i) => (
          <li key={i}>
            <strong>{SCOPE_LABELS[fix.scope]}:</strong>{" "}
            <MessageText message={fix.message} /> (
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
