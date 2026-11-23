import type {
  SettingDetails,
  StepDetails,
} from "../../../application/details/details";
import { settingValueText } from "../../../application/details/setting-text";
import { sameContent } from "../../../application/run-analysis/same-content";
import type { UseCases } from "../../app/use-cases";
import { useUseCases } from "../../app/useUseCases";
import { inSentence } from "../../shared/in-sentence";
import type { Edit } from "../useProjectEdits";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { Setting } from "./Setting";

export interface StepSettingsProps {
  readonly details: StepDetails;
  /** Saves a change to a setting, or its reset to the default. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: FieldProps["announce"];
}

/**
 * A step's request settings (ADR-0024), each a field that holds a draft and
 * saves it once it passes, as a component's settings do: the same
 * descriptors and fields. A setting the step doesn't set shows its type's
 * default, marked as such. Nothing for a step whose action takes none.
 */
export function StepSettings({ details, onEdit, announce }: StepSettingsProps) {
  const { setStepSetting } = useUseCases();
  if (details.settings.length === 0) return null;
  const run: SettingRun = { details, onEdit, announce, setStepSetting };
  return (
    <section className={styles.settings} aria-label="Request settings">
      {details.settings.map((setting) => (
        <Setting
          key={setting.key}
          setting={setting}
          announce={announce}
          {...settingCommands(run, setting)}
        />
      ))}
    </section>
  );
}

/** What a setting's save needs: the step, and how to save and say it. */
interface SettingRun extends StepSettingsProps {
  readonly setStepSetting: UseCases["setStepSetting"];
}

/** What a setting's field and its Reset save. */
interface SettingCommands {
  readonly save: (value: unknown) => void;
  readonly reset: () => void;
}

/**
 * A setting's save and Reset: one command each, and so one undo step,
 * named for the step and the setting, "Change store · read's item size";
 * each says what the setting is now. Reset saves the default, which the
 * step then follows.
 */
function settingCommands(
  run: SettingRun,
  setting: SettingDetails,
): SettingCommands {
  const what = `${run.details.step.label}'s ${inSentence(setting.label)}`;
  const saveAs = (verb: string) => (value: unknown) => {
    saveSetting({ run, setting, value, undoName: `${verb} ${what}` });
  };
  return {
    save: saveAs("Change"),
    reset: () => {
      saveAs("Reset")(setting.editor?.defaultValue);
    },
  };
}

/** One save of one setting, and its undo name. */
interface SaveSettingInput {
  readonly run: SettingRun;
  readonly setting: SettingDetails;
  readonly value: unknown;
  readonly undoName: string;
}

/** Saves the value on the step, and announces what the setting is now. */
function saveSetting({ run, setting, value, undoName }: SaveSettingInput) {
  const { details, onEdit, announce, setStepSetting } = run;
  const { workflowId, step } = details;
  const { key } = setting;
  onEdit({
    command: (record) =>
      setStepSetting.execute(record, {
        workflowId,
        stepId: step.stepId,
        key,
        value,
      }),
    describe: () => undoName,
  });
  announce(savedText({ details, setting, value }));
}

/** A step's setting, and the value it was set to. */
interface SavedTextInput {
  readonly details: StepDetails;
  readonly setting: SettingDetails;
  readonly value: unknown;
}

/**
 * "Set store · read's item size to 40 KB.", or "… to the default, 4 KB."
 * when the step follows the default again.
 */
function savedText({ details, setting, value }: SavedTextInput): string {
  const { editor } = setting;
  if (editor === undefined) return "";
  const what = `${details.step.label}'s ${inSentence(setting.label)}`;
  const text = settingValueText(editor.field, value);
  const isDefault = sameContent(value, editor.defaultValue);
  return `Set ${what} to ${isDefault ? `the default, ${text}` : text}.`;
}
