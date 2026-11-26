import type { ComponentRegistry } from "../../domain/components/component-registry";
import { COMPONENT_CATEGORIES } from "../details/component-category";
import type { FieldCatalog } from "../details/field-descriptor";

export interface ListComponentTypesDependencies {
  /** The types there are, and their display names. */
  readonly registry: ComponentRegistry;
  /** Each type's line on what it's for, and its category. */
  readonly fields: FieldCatalog;
}

/** One type the dock's Library offers. */
export interface ComponentTypeChoice {
  /** The component definition's type, e.g. `"api-gateway"`. */
  readonly type: string;
  /** E.g. "API Gateway". */
  readonly displayName: string;
  /**
   * What it's for, e.g. "the front door; throttles requests over its
   * rate."; undefined if the catalog has no descriptors for the type.
   */
  readonly purpose: string | undefined;
}

/** The types of one category, as the Library lists them under a heading. */
export interface ComponentTypeGroup {
  /**
   * The category's heading, e.g. "Front door"; undefined for the last group,
   * the types with no descriptors, which has no heading.
   */
  readonly heading: string | undefined;
  /** In order of display name. */
  readonly types: readonly ComponentTypeChoice[];
}

/** Orders two choices by display name. */
function byDisplayName(a: ComponentTypeChoice, b: ComponentTypeChoice): number {
  if (a.displayName === b.displayName) return 0;
  return a.displayName < b.displayName ? -1 : 1;
}

/**
 * The component types a user can add, grouped by category, each with a line
 * on what it's for (UX design §2.1 step 2, §4). Groups come in the order of
 * `COMPONENT_CATEGORIES`, a category with no types is left out, and a type
 * with no descriptors goes in a last group with no heading, so it's never
 * hidden. A new type registered with its descriptors joins its category
 * with no change here.
 */
export class ListComponentTypes {
  private readonly deps: ListComponentTypesDependencies;

  constructor(deps: ListComponentTypesDependencies) {
    this.deps = deps;
  }

  execute(): ComponentTypeGroup[] {
    const { registry, fields } = this.deps;
    const choices = registry.list().map(({ type, displayName }) => ({
      type,
      displayName,
      purpose: fields.get(type)?.purpose,
    }));
    const groups: ComponentTypeGroup[] = COMPONENT_CATEGORIES.map(
      ({ category, label }) => ({
        heading: label,
        types: choices
          .filter((c) => fields.get(c.type)?.category === category)
          .sort(byDisplayName),
      }),
    );
    const uncategorized = choices.filter(
      (c) =>
        !COMPONENT_CATEGORIES.some(
          (k) => k.category === fields.get(c.type)?.category,
        ),
    );
    return [
      ...groups,
      { heading: undefined, types: uncategorized.sort(byDisplayName) },
    ].filter((group) => group.types.length > 0);
  }
}
