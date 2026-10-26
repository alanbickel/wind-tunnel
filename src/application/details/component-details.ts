import type { ComponentType } from "../../domain/components/component-registry";
import type { Component, Project } from "../../domain/model/project";
import { workflowsCalling } from "./called-by";
import { valueAt } from "./config-value";
import type { ComponentDetails, SettingDetails } from "./details";
import type { ConfigFieldDescriptor, TypeFields } from "./field-descriptor";
import { defaultNote, settingValueText } from "./setting-text";

/** A component, and what's known about its type. */
export interface ComponentDetailsInput {
  readonly project: Project;
  readonly component: Component;
  /** Undefined if the registry has no such type. */
  readonly type: ComponentType | undefined;
  /** Undefined if the catalog has no descriptors for the type. */
  readonly fields: TypeFields | undefined;
}

/**
 * A component's details: its name and type, each setting as its descriptor
 * reads it, with the type's default, and the workflows that call it. A
 * setting with no descriptor is still listed, by its key, so none is hidden.
 */
export function componentDetails(
  input: ComponentDetailsInput,
): ComponentDetails {
  const { project, component, type } = input;
  return {
    kind: "component",
    componentId: component.id,
    name: component.name,
    typeName: type?.displayName ?? component.type,
    defaultConfig: type?.defaultConfig,
    settings: [...describedSettings(input), ...undescribedSettings(input)],
    calledBy: workflowsCalling(project, component.id),
  };
}

function describedSettings(input: ComponentDetailsInput): SettingDetails[] {
  const { component, type, fields } = input;
  return (fields?.fields ?? []).map((field) =>
    describedSetting({
      field,
      value: valueAt(component.config, field.key),
      defaultValue: valueAt(type?.defaultConfig, field.key),
    }),
  );
}

interface DescribedSettingInput {
  readonly field: ConfigFieldDescriptor;
  readonly value: unknown;
  readonly defaultValue: unknown;
}

function describedSetting({
  field,
  value,
  defaultValue,
}: DescribedSettingInput): SettingDetails {
  return {
    key: field.key,
    label: field.label,
    value: settingValueText(field, value),
    help: field.help,
    defaultNote:
      defaultValue === undefined
        ? undefined
        : defaultNote({ field, value: defaultValue, evidence: field.evidence }),
    editor: { field, value, defaultValue },
  };
}

/** Settings in the config that no descriptor covers, by key. */
function undescribedSettings({
  component,
  fields,
}: ComponentDetailsInput): SettingDetails[] {
  const described = new Set(fields?.fields.map((field) => field.key));
  return Object.entries(component.config)
    .filter(([key]) => !described.has(key))
    .map(([key, value]) => ({
      key,
      label: key,
      value: JSON.stringify(value),
      help: "",
      defaultNote: undefined,
      editor: undefined,
    }));
}
