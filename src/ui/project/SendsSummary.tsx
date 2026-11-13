import { useId } from "react";
import type { SendsDetails } from "../../application/details/details";
import styles from "./MixBar.module.css";
import { Swatch } from "./Swatch";

export interface SendsSummaryProps {
  readonly sends: SendsDetails;
}

/**
 * "What this sends" (UX design §8): about how many requests the profile sends
 * before the run ends, how many each workflow gets, and the peak rate. An
 * empty mix has no workflow lines.
 */
export function SendsSummary({ sends }: SendsSummaryProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.sends}>
      <p id={headingId} className={styles.sendsHeading}>
        What this sends
      </p>
      <p className={styles.sendsList}>{sends.totalText}</p>
      <p className={styles.sendsList}>{sends.peakText}</p>
      {sends.rows.length > 0 && (
        <ul className={styles.sendsList}>
          {sends.rows.map((row, index) => (
            <li key={`${row.workflowName}-${String(index)}`}>
              <Swatch colorIndex={row.colorIndex} />
              {row.workflowName}: {row.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
