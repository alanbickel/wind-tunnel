import type { ComponentType } from "../../domain/components/component-registry";
import type { Step } from "../../domain/model/project";
import { valueAt } from "./config-value";
import type { SettingDetails } from "./details";
import type { ConfigFieldDescriptor, TypeFields } from "./field-descriptor";
import { defaultNote, settingValueText } from "./setting-text";

/** A step, and what's known about the type of the component it calls. */
export interface RequestSettingDetailsInput {
  readonly step: Step;
  /** Undefined if the step's component, or its type, is gone. */
  readonly type: ComponentType | undefined;
  /** Undefined if the catalog has no descriptors for the type. */
  readonly fields: TypeFields | undefined;
}

/** What a request setting the step doesn't set says beside its field. */
const USES_DEFAULT = "Uses the default";

/**
 * A step's request settings (ADR-0024), in the order its type's descriptors
 * list them for the step's action: each with the value the step sets, or
 * else the type's default, marked "Uses the default". Empty for an action
 * that takes none, and for a step whose type is gone, since there's nothing
 * to read them against.
 */
export function requestSettingDetails({
  step,
  type,
  fields,
}: RequestSettingDetailsInput): SettingDetails[] {
  if (type === undefined) return [];
  const defaults = type.parseSettings(step.action, {});
  return (fields?.requestFields?.[step.action] ?? []).map((field) =>
    requestSetting({
      field,
      set: valueAt(step.settings, field.key),
      defaultValue: valueAt(defaults, field.key),
    }),
  );
}

/** One request setting: what the step sets, if anything, and the default. */
interface RequestSettingInput {
  readonly field: ConfigFieldDescriptor;
  /** Undefined if the step doesn't set it. */
  readonly set: unknown;
  readonly defaultValue: unknown;
}

function requestSetting({
  field,
  set,
  defaultValue,
}: RequestSettingInput): SettingDetails {
  const value = set ?? defaultValue;
  return {
    key: field.key,
    label: field.label,
    value: settingValueText(field, value),
    help: field.help,
    defaultNote: defaultNote({
      field,
      value: defaultValue,
      evidence: field.evidence,
    }),
    defaultMark: set === undefined ? USES_DEFAULT : undefined,
    editor: { field, value, defaultValue },
  };
}
