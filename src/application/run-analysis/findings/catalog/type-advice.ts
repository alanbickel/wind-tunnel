import type { Project } from "../../../../domain/model/project";
import type { Finding, Fix } from "../finding";

/**
 * What a component type knows about fixing one of its limits, or one kind
 * of finding at it. Fixes aren't computed: each is written here once, with
 * its evidence (findings.md §2.1).
 */
export interface Advice {
  readonly fixes: readonly Fix[];
  /** Anchor in `docs/learning/aws-did-you-know.md`, if one fits. */
  readonly learnMore: string | undefined;
}

/** One component type's advice, keyed by limit name and by finding kind. */
export interface TypeAdvice {
  /** The component definition's type, e.g. `"rds"`. */
  readonly type: string;
  readonly limits: Readonly<Record<string, Advice>>;
  /**
   * Advice that depends on what happened at a component rather than on one
   * of its limits, keyed by the finding's `key.kind`: SQS's redrive policy
   * under failed deliveries (ADR-0015's second addendum).
   */
  readonly kinds: Readonly<Record<string, Advice>>;
}

/** Every type's advice, keyed by type. */
export type FindingsCatalog = ReadonlyMap<string, TypeAdvice>;

/** Which entry of a type's advice to look up. */
interface AdviceEntryInput {
  readonly type: string;
  readonly entries: (advice: TypeAdvice) => Readonly<Record<string, Advice>>;
  readonly name: string;
}

/** The entry, or undefined if the catalog has none. */
function adviceEntry(
  catalog: FindingsCatalog,
  { type, entries, name }: AdviceEntryInput,
): Advice | undefined {
  const advice = catalog.get(type);
  if (advice === undefined) return undefined;
  const found = entries(advice);
  return Object.hasOwn(found, name) ? found[name] : undefined;
}

/** A component's limits to collect the advice of. */
export interface ComponentAdviceInput {
  readonly project: Project;
  readonly componentId: string;
  readonly limitNames: readonly string[];
}

/** The advice a finding carries: every entry's fixes, and one Learn more. */
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
  const type = typeOf(project, componentId);
  return mergedAdvice(
    limitNames.map((name) =>
      adviceEntry(catalog, { type, entries: (a) => a.limits, name }),
    ),
  );
}

/** Components whose types may have advice for a kind of finding. */
export interface KindAdviceInput {
  readonly project: Project;
  readonly componentIds: readonly string[];
  readonly kind: string;
}

/**
 * The catalog's advice under the finding kind for each component's type, in
 * the order given, each type once: their fixes, and the first Learn-more
 * anchor among them.
 */
export function kindAdviceFor(
  catalog: FindingsCatalog,
  { project, componentIds, kind }: KindAdviceInput,
): FindingAdvice {
  const types = new Set(componentIds.map((id) => typeOf(project, id)));
  return mergedAdvice(
    [...types].map((type) =>
      adviceEntry(catalog, { type, entries: (a) => a.kinds, name: kind }),
    ),
  );
}

/**
 * Advice from several entries, in order: every fix, and the first Learn
 * more. An entry the catalog doesn't have adds nothing.
 */
export function mergedAdvice(
  advice: readonly (FindingAdvice | undefined)[],
): FindingAdvice {
  const found = advice.flatMap((a) => (a === undefined ? [] : [a]));
  return {
    fixes: found.flatMap((a) => a.fixes),
    learnMore: found.find((a) => a.learnMore !== undefined)?.learnMore,
  };
}

function typeOf(project: Project, componentId: string): string {
  return (
    project.architecture.components.find((c) => c.id === componentId)?.type ??
    ""
  );
}
