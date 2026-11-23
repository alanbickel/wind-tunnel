import type {
  ComponentRegistry,
  ComponentType,
} from "../../domain/components/component-registry";
import type { Step, StepSettings, Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { valueAt } from "../details/config-value";
import { sameContent } from "../run-analysis/same-content";
import { findStep } from "./step-search";
import { replaceStep, type StepInput } from "./workflow-edits";

// An edit command (ADR-0019) for a step's request settings (ADR-0024).
// Unlike the other commands, it checks the value itself: settings that
// don't fit are a run issue, not a save error, so `SaveProject` wouldn't
// stop them.

/** One request setting of one step, and its new value. */
export interface StepSettingChange extends StepInput {
  /** The setting's key in its action's schema, e.g. `"itemSizeKb"`. */
  readonly key: string;
  /** The new value; the type's default makes the step follow it again. */
  readonly value: unknown;
}

/** A change to a step's setting, and the types that say what fits. */
export interface SetStepSettingInput extends StepSettingChange {
  /** The step's component's type: its defaults and its schema. */
  readonly registry: ComponentRegistry;
}

/**
 * Sets one of a step's request settings. A step stores only what it sets
 * (ADR-0024 decision 2), so a value equal to the type's default removes its
 * key, and the step loses `settings` when none is left: setting the default
 * is how a step goes back to following it. Returns the record as it was for
 * a value the action's schema refuses, a key it doesn't have, a step whose
 * component or type is gone or that isn't in the workflow, and a change
 * that leaves the settings as they were.
 */
export function setStepSetting(
  record: ProjectRecord,
  input: SetStepSettingInput,
): ProjectRecord {
  const found = stepAndType(record, input);
  if (found === undefined) return record;
  const { workflow, step, type } = found;
  const settings = nextSettings({ ...input, step, type });
  if (settings === undefined || sameContent(settings, step.settings ?? {})) {
    return record;
  }
  return replaceStep(record, { workflow, step: withSettings(step, settings) });
}

/** The step a change is to, its workflow, and its component's type. */
interface StepAndType {
  readonly workflow: Workflow;
  readonly step: Step;
  readonly type: ComponentType;
}

/** The change's step and its type; undefined if either isn't there. */
function stepAndType(
  record: ProjectRecord,
  { workflowId, stepId, registry }: SetStepSettingInput,
): StepAndType | undefined {
  const workflow = record.project.workflows.find((w) => w.id === workflowId);
  const step = workflow && findStep(workflow, stepId);
  const type = step && typeOf(record, { step, registry });
  return workflow && step && type && { workflow, step, type };
}

/** A step, and the types to find its component's in. */
interface TypeOfInput {
  readonly step: Step;
  readonly registry: ComponentRegistry;
}

/** The type of the component the step calls; undefined if either is gone. */
function typeOf(
  record: ProjectRecord,
  { step, registry }: TypeOfInput,
): ComponentType | undefined {
  const component = record.project.architecture.components.find(
    (c) => c.id === step.componentId,
  );
  return component && registry.get(component.type);
}

/** A change, the step it's to, and the step's type. */
interface NextSettingsInput extends StepSettingChange {
  readonly step: Step;
  readonly type: ComponentType;
}

/**
 * The step's settings with the change, without the key if the value is
 * the default; undefined if the action has no such setting, or the
 * schema refuses the value. Only the changed key's issues count, so a
 * setting stored wrong elsewhere doesn't block fixing this one.
 */
function nextSettings(input: NextSettingsInput): StepSettings | undefined {
  const { step, type, key, value } = input;
  const defaults = type.parseSettings(step.action, {});
  if (!Object.hasOwn(defaults, key)) return undefined;
  const others = Object.entries(step.settings ?? {}).filter(([k]) => k !== key);
  const isDefault = sameContent(value, valueAt(defaults, key));
  const next = Object.fromEntries(
    isDefault ? others : [...others, [key, value]],
  );
  const issues = type
    .checkSettings(step.action, next)
    .filter((issue) => issue.path[0] === key);
  return issues.length === 0 ? next : undefined;
}

/**
 * The step with these settings; a step that sets none has no `settings`,
 * and is rebuilt naming every field it keeps.
 */
function withSettings(step: Step, settings: StepSettings): Step {
  if (Object.keys(settings).length > 0) return { ...step, settings };
  const { id, componentId, action, calls, async } = step;
  return {
    id,
    componentId,
    action,
    ...(calls && { calls }),
    ...(async && { async }),
  };
}
