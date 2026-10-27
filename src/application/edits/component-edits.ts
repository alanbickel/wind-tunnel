import type { Component } from "../../domain/model/project";
import { valueAt } from "../details/config-value";
import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves. A command for a component the project
// doesn't have returns the record unchanged, except `addComponent`.

/** One setting of one component, and its new value. */
export interface SetComponentSettingInput {
  readonly componentId: string;
  /** The config key, e.g. `"queryWorkers"`. */
  readonly key: string;
  readonly value: unknown;
}

/** Sets one of a component's settings. */
export function setComponentSetting(
  record: ProjectRecord,
  { componentId, key, value }: SetComponentSettingInput,
): ProjectRecord {
  return changeComponent(record, {
    componentId,
    change: (component) => ({
      ...component,
      config: { ...component.config, [key]: value },
    }),
  });
}

/** A component, and its new name. */
export interface RenameComponentInput {
  readonly componentId: string;
  readonly name: string;
}

/**
 * Renames a component. Steps and edges refer to it by id, so nothing else
 * changes.
 */
export function renameComponent(
  record: ProjectRecord,
  { componentId, name }: RenameComponentInput,
): ProjectRecord {
  return changeComponent(record, {
    componentId,
    change: (component) => ({ ...component, name }),
  });
}

/** One setting of one component, and its type's defaults. */
export interface ResetComponentSettingInput {
  readonly componentId: string;
  readonly key: string;
  /** The component type's `defaultConfig`. */
  readonly defaultConfig: unknown;
}

/**
 * Sets a component's setting to its type's default. Unchanged if the
 * defaults have no such setting.
 */
export function resetComponentSetting(
  record: ProjectRecord,
  { componentId, key, defaultConfig }: ResetComponentSettingInput,
): ProjectRecord {
  const value = valueAt(defaultConfig, key);
  if (value === undefined) return record;
  return setComponentSetting(record, { componentId, key, value });
}

/** A new component: its id, its type, and the type's defaults. */
export interface AddComponentInput {
  /** A new id, from the `IdGenerator` port. */
  readonly componentId: string;
  /** The component definition's type, e.g. `"lambda"`. */
  readonly type: string;
  /** The type's `defaultConfig`, which becomes the component's settings. */
  readonly defaultConfig: Readonly<Record<string, unknown>>;
}

/**
 * Adds a component with its type's default settings, named for its type
 * and the lowest number that no component of the type uses in its name
 * ("lambda-2" beside "lambda-1" and "lambda-3"). The layout doesn't place
 * it, so the diagram puts it in its spare row.
 */
export function addComponent(
  record: ProjectRecord,
  { componentId, type, defaultConfig }: AddComponentInput,
): ProjectRecord {
  const { project } = record;
  const { architecture } = project;
  const component: Component = {
    id: componentId,
    type,
    name: nextFreeName(architecture.components, type),
    config: defaultConfig,
  };
  const components = [...architecture.components, component];
  return {
    ...record,
    project: { ...project, architecture: { ...architecture, components } },
  };
}

/** `type-1`, `type-2`, …: the first that no component of `type` is named. */
function nextFreeName(components: readonly Component[], type: string): string {
  const taken = new Set(
    components.filter((c) => c.type === type).map((c) => c.name),
  );
  let number = 1;
  while (taken.has(`${type}-${String(number)}`)) number++;
  return `${type}-${String(number)}`;
}

/** A component to remove. */
export interface RemoveComponentInput {
  readonly componentId: string;
}

/**
 * Removes a component, every edge to or from it, and its place in the
 * layout (ADR-0019, decision 3). Workflow steps that call it stay as they
 * are; they become run issues, which stop only the workloads that use them.
 */
export function removeComponent(
  record: ProjectRecord,
  { componentId }: RemoveComponentInput,
): ProjectRecord {
  const { project, layout } = record;
  const { architecture } = project;
  if (!architecture.components.some((c) => c.id === componentId)) return record;
  const components = architecture.components.filter(
    (c) => c.id !== componentId,
  );
  const edges = architecture.edges.filter(
    (e) => e.from !== componentId && e.to !== componentId,
  );
  const nodes = Object.fromEntries(
    Object.entries(layout.nodes).filter(([id]) => id !== componentId),
  );
  return {
    ...record,
    project: { ...project, architecture: { components, edges } },
    layout: { ...layout, nodes },
  };
}

interface ChangeComponentInput {
  readonly componentId: string;
  readonly change: (component: Component) => Component;
}

/** The record with one component changed, or as it was if there's no such component. */
function changeComponent(
  record: ProjectRecord,
  { componentId, change }: ChangeComponentInput,
): ProjectRecord {
  const { project } = record;
  const { architecture } = project;
  if (!architecture.components.some((c) => c.id === componentId)) return record;
  const components = architecture.components.map((component) =>
    component.id === componentId ? change(component) : component,
  );
  return {
    ...record,
    project: { ...project, architecture: { ...architecture, components } },
  };
}
