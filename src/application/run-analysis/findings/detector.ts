import type { RunSoFar } from "../run-so-far";
import type { Finding } from "./finding";

/**
 * Reads a run and returns whole findings: one rule of findings.md §2.1. A
 * new detector is a new file and one line in `createDetectors`; nothing
 * else changes (ADR-0015).
 *
 * A detector must be pure and generic: the same run gives the same
 * findings, and nothing branches on a component's type. What a type knows
 * comes from its limit declarations (`LimitUse.whenFull`) and the catalog.
 * To keep the run panel responsive, it reads the snapshots in one pass.
 */
export interface Detector {
  readonly id: string;
  detect(run: RunSoFar): readonly Finding[];
}
