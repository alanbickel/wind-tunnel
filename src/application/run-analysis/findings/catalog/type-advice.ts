import type { Project } from "../../../../domain/model/project";
import type { Finding, Fix } from "../finding";

/**
 * What a component type knows about fixing one of its limits. Fixes aren't
 * computed: each is written here once, with its evidence (findings.md §2.1).
 */
export interface LimitAdvice {
  readonly fixes: readonly Fix[];
  /** Anchor in `docs/learning/aws-did-you-know.md`, if one fits. */
  readonly learnMore: string | undefined;
}

/** One component type's advice, keyed by limit name. */
export interface TypeAdvice {
  /** The component definition's type, e.g. `"rds"`. */
  readonly type: string;
  readonly limits: Readonly<Record<string, LimitAdvice>>;
}

/** Every type's advice, keyed by type. */
export type FindingsCatalog = ReadonlyMap<string, TypeAdvice>;

/** Which limit to look up advice for. */
export interface LimitAdviceInput {
  readonly type: string;
  readonly limitName: string;
}

/** The advice for a type's limit, or undefined if the catalog has none. */
export function limitAdvice(
  catalog: FindingsCatalog,
  { type, limitName }: LimitAdviceInput,
): LimitAdvice | undefined {
  const limits = catalog.get(type)?.limits ?? {};
  return Object.hasOwn(limits, limitName) ? limits[limitName] : undefined;
}

/** A component's limits to collect the advice of. */
export interface ComponentAdviceInput {
  readonly project: Project;
  readonly componentId: string;
  readonly limitNames: readonly string[];
}

/** The advice a finding carries: every limit's fixes, and one Learn more. */
export type FindingAdvice = Pick<Finding, "fixes" | "learnMore">;

/**
 * The catalog's advice for the component's limits, in the order given:
 * their fixes, and the first Learn-more anchor among them. A limit the
 * catalog doesn't cover adds nothing.
 */
export function adviceFor(
  catalog: FindingsCatalog,
  { project, componentId, limitNames }: ComponentAdviceInput,
): FindingAdvice {
  const type =
    project.architecture.components.find((c) => c.id === componentId)?.type ??
    "";
  const advice = limitNames.flatMap((limitName) => {
    const found = limitAdvice(catalog, { type, limitName });
    return found === undefined ? [] : [found];
  });
  return {
    fixes: advice.flatMap((a) => a.fixes),
    learnMore: advice.find((a) => a.learnMore !== undefined)?.learnMore,
  };
}
