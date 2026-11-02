import { useId, type ReactNode } from "react";
import type { SettingDetails } from "../../../application/details/details";
import type {
  ConfigFieldDescriptor,
  DistributionFieldDescriptor,
  NumberFieldDescriptor,
} from "../../../application/details/field-descriptor";
import { sameContent } from "../../../application/run-analysis/same-content";
import type { KindHandlers } from "../../../domain/shared/kind-handlers";
import { Button } from "../../shared/Button";
import { dispatchKind } from "../../shared/kind-dispatch";
import { DistributionField } from "./DistributionField";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { NumberField } from "./NumberField";

export interface SettingProps extends FieldProps {
  readonly setting: SettingDetails;
  /** Puts the setting's default back: "Reset to default". */
  readonly reset: () => void;
}

/**
 * One setting: its field, its help, and its default with Reset beside it.
 * It saves and resets through `save` and `reset`, so it serves any
 * setting a descriptor covers.
 */
export function Setting(props: SettingProps) {
  const { setting, reset, ...fieldProps } = props;
  const helpId = useId();
  const defaultId = useId();
  const describedBy =
    setting.defaultNote === undefined ? helpId : `${helpId} ${defaultId}`;
  return (
    <div className={styles.setting}>
      <SettingField setting={setting} helpId={describedBy} {...fieldProps} />
      <p id={helpId} className={styles.help}>
        {setting.help}
      </p>
      <DefaultLine id={defaultId} setting={setting} reset={reset} />
    </div>
  );
}

interface SettingFieldProps extends FieldProps {
  readonly setting: SettingDetails;
  readonly helpId: string;
}

/**
 * The field for the setting's kind, a number or a distribution; or its
 * value, read-only, if no descriptor covers it.
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
  ConfigFieldDescriptor,
  (context: FieldContext) => ReactNode
> = {
  number: numberField,
  "whole-number": numberField,
  distribution: (field: DistributionFieldDescriptor) => (context) => (
    <DistributionField field={field} {...context} />
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

interface DefaultLineProps {
  readonly id: string;
  readonly setting: SettingDetails;
  readonly reset: () => void;
}

/** "Default 16: an assumption (RDS-2)." and a button that resets to it. */
function DefaultLine({ id, setting, reset }: DefaultLineProps) {
  const { editor, defaultNote } = setting;
  if (defaultNote === undefined) return null;
  return (
    <p className={styles.default}>
      <span id={id}>{defaultNote}</span>
      {editor !== undefined && (
        <Button
          usable={!sameContent(editor.value, editor.defaultValue)}
          label={`Reset to default: ${setting.label}`}
          onClick={reset}
        >
          Reset to default
        </Button>
      )}
    </p>
  );
}
