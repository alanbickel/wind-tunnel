import { useId, type ReactNode } from "react";
import type { SettingDetails } from "../../../application/details/details";
import type {
  DistributionFieldDescriptor,
  NumberFieldDescriptor,
  RetryFieldDescriptor,
  SettingFieldDescriptor,
} from "../../../application/details/field-descriptor";
import { sameContent } from "../../../application/run-analysis/same-content";
import type { KindHandlers } from "../../../domain/shared/kind-handlers";
import { Button } from "../../shared/Button";
import { Explained } from "../../shared/Explained";
import { dispatchKind } from "../../shared/kind-dispatch";
import { DistributionField } from "./DistributionField";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { NumberField } from "./NumberField";
import { RetryField } from "./RetryField";

export interface SettingProps extends FieldProps {
  readonly setting: SettingDetails;
  /** Puts the setting's default back: "Reset to default". */
  readonly reset: () => void;
}

/**
 * One setting: its field with Reset beside it, and "Uses the default" after
 * them for a step's request setting the step doesn't set, and an info
 * control that opens its help and its default's evidence. Reset stays out
 * of the info content so it's reachable without opening anything. The help
 * and the default note stay in the DOM while hidden, so they still describe
 * the field to a screen reader. It saves and resets through `save` and
 * `reset`, so it serves a component's settings and an edge's alike.
 */
export function Setting(props: SettingProps) {
  const { setting, reset, ...fieldProps } = props;
  const helpId = useId();
  const defaultId = useId();
  const markId = useId();
  const describedBy = describedByOf(setting, { helpId, defaultId, markId });
  return (
    <div className={styles.setting}>
      <Explained
        title={
          <>
            <SettingField
              setting={setting}
              helpId={describedBy}
              {...fieldProps}
            />
            <ResetButton setting={setting} reset={reset} />
            <DefaultMark id={markId} setting={setting} />
          </>
        }
        subject={setting.label}
      >
        <p id={helpId} className={styles.help}>
          {setting.help}
        </p>
        <DefaultNote id={defaultId} setting={setting} />
      </Explained>
    </div>
  );
}

/** The ids of what describes a setting's field. */
interface SettingIds {
  readonly helpId: string;
  readonly defaultId: string;
  readonly markId: string;
}

/** Its help, then its default note and its default mark, if it has them. */
function describedByOf(setting: SettingDetails, ids: SettingIds): string {
  return [
    ids.helpId,
    setting.defaultNote === undefined ? undefined : ids.defaultId,
    setting.defaultMark === undefined ? undefined : ids.markId,
  ]
    .filter((id) => id !== undefined)
    .join(" ");
}

interface SettingFieldProps extends FieldProps {
  readonly setting: SettingDetails;
  readonly helpId: string;
}

/**
 * The field for the setting's kind, a number, a distribution, or a retry
 * policy; or its value, read-only, if no descriptor covers it.
 */
function SettingField({ setting, ...props }: SettingFieldProps) {
  const { editor } = setting;
  if (editor === undefined) return <ReadOnlySetting setting={setting} />;
  const { field, value } = editor;
  return dispatchKind(FIELDS, field)({ value, ...props });
}

/** What a setting's field is given besides its descriptor. */
interface FieldContext extends FieldProps {
  /** As stored. */
  readonly value: unknown;
  readonly helpId: string;
}

/** A number setting's field, for either kind of number. */
const numberField =
  (field: NumberFieldDescriptor) => (context: FieldContext) => (
    <NumberField field={field} {...context} />
  );

/** The field for each kind of descriptor; a new kind registers its own. */
const FIELDS: KindHandlers<
  SettingFieldDescriptor,
  (context: FieldContext) => ReactNode
> = {
  number: numberField,
  "whole-number": numberField,
  distribution: (field: DistributionFieldDescriptor) => (context) => (
    <DistributionField field={field} {...context} />
  ),
  retry: (field: RetryFieldDescriptor) => (context) => (
    <RetryField field={field} {...context} />
  ),
};

interface ReadOnlySettingProps {
  readonly setting: SettingDetails;
}

/** A setting no descriptor covers: shown by its key, and not editable. */
function ReadOnlySetting({ setting }: ReadOnlySettingProps) {
  return (
    <p className={styles.readOnly}>
      <span className={styles.label}>{setting.label}</span>: {setting.value}
    </p>
  );
}

interface DefaultNoteProps {
  readonly id: string;
  readonly setting: SettingDetails;
}

/** "Default 16: an assumption (RDS-2)." */
function DefaultNote({ id, setting }: DefaultNoteProps) {
  if (setting.defaultNote === undefined) return null;
  return (
    <p id={id} className={styles.default}>
      {setting.defaultNote}
    </p>
  );
}

interface DefaultMarkProps {
  readonly id: string;
  readonly setting: SettingDetails;
}

/** "Uses the default", for a step's request setting the step doesn't set. */
function DefaultMark({ id, setting }: DefaultMarkProps) {
  if (setting.defaultMark === undefined) return null;
  return (
    <span id={id} className={styles.mark}>
      {setting.defaultMark}
    </span>
  );
}

interface ResetButtonProps {
  readonly setting: SettingDetails;
  readonly reset: () => void;
}

/** A button that puts the setting's default back; nothing if it has no default or no field. */
function ResetButton({ setting, reset }: ResetButtonProps) {
  const { editor, defaultNote } = setting;
  if (defaultNote === undefined || editor === undefined) return null;
  return (
    <Button
      usable={!sameContent(editor.value, editor.defaultValue)}
      label={`Reset to default: ${setting.label}`}
      onClick={reset}
    >
      Reset to default
    </Button>
  );
}
