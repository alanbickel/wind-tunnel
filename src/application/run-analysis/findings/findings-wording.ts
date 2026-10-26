import type { ComponentNames } from "../component-names";
import type { Phrasebook } from "./phrasebook";

/**
 * How a run's findings are worded: the phrasebook words their statements,
 * and `nameOf` names the components in them. The CLI and the run panel
 * each format the result their own way (ADR-0015).
 */
export interface FindingsWording {
  readonly phrasebook: Phrasebook;
  readonly nameOf: ComponentNames;
}
