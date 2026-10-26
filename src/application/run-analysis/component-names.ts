import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Component, Project } from "../../domain/model/project";

/**
 * How a component is shown, by ID: its name, never its ID (UX design §5).
 * Where components of two types share the name, the type follows it:
 * "orders (DynamoDB)". An ID the project doesn't have reads as itself.
 */
export type ComponentNames = (componentId: string) => string;

/**
 * Every component's shown name, worked out once for the project, so the
 * lookup never branches on a name's being shared.
 */
export function componentNames(
  project: Project,
  registry: ComponentRegistry,
): ComponentNames {
  const { components } = project.architecture;
  const shared = sharedNames(components);
  const shown = new Map(
    components.map((c) => {
      const typeName = registry.get(c.type)?.displayName ?? c.type;
      const name = shared.has(c.name) ? `${c.name} (${typeName})` : c.name;
      return [c.id, name];
    }),
  );
  return (componentId) => shown.get(componentId) ?? componentId;
}

/** The names that components of more than one type use. */
function sharedNames(components: readonly Component[]): ReadonlySet<string> {
  const typesByName = new Map<string, Set<string>>();
  for (const { name, type } of components) {
    const types = typesByName.get(name) ?? new Set<string>();
    typesByName.set(name, types.add(type));
  }
  const shared = [...typesByName].filter(([, types]) => types.size > 1);
  return new Set(shared.map(([name]) => name));
}
