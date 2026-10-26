import type { Component } from "../../domain/model/project";
import { valueAt } from "../details/config-value";
import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves. A command for a component the project
// doesn't have returns the record unchanged.

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
