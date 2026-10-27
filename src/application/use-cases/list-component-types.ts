import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { FieldCatalog } from "../details/field-descriptor";

export interface ListComponentTypesDependencies {
  /** The types there are, and their display names. */
  readonly registry: ComponentRegistry;
  /** Each type's line on what it's for. */
  readonly fields: FieldCatalog;
}

/** One type "Add component" offers. */
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

/**
 * The component types a user can add, in registration order, each with a
 * line on what it's for (UX design §2.1 step 2). A new type registered
 * with its descriptors joins the list with no change here.
 */
export class ListComponentTypes {
  private readonly deps: ListComponentTypesDependencies;

  constructor(deps: ListComponentTypesDependencies) {
    this.deps = deps;
  }

  execute(): ComponentTypeChoice[] {
    const { registry, fields } = this.deps;
    return registry.list().map(({ type, displayName }) => ({
      type,
      displayName,
      purpose: fields.get(type)?.purpose,
    }));
  }
}
