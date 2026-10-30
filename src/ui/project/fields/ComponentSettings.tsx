import type {
  ComponentDetails,
  SettingDetails,
} from "../../../application/details/details";
import {
  resetComponentSetting,
  setComponentSetting,
} from "../../../application/edits/component-edits";
import type { Project } from "../../../domain/model/project";
import type { EditCommand } from "../useProjectEdits";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { NameField, type NameFieldProps } from "./NameField";
import { Setting } from "./Setting";

export interface ComponentSettingsProps {
  readonly project: Project;
  readonly details: ComponentDetails;
  /** Saves a change: a setting, a rename, or a reset to the default. */
  readonly onEdit: (command: EditCommand) => void;
  readonly announce: FieldProps["announce"];
  /** Whether the name field takes the focus, as it does for a new component. */
  readonly takeFocus: NameFieldProps["takeFocus"];
}

/**
 * A component's name and settings, each a field that holds a draft and
 * saves it once it passes (UX design §2.2, §4.3). Each setting's fields
 * come from its type's descriptors, so a new type brings its own.
 */
export function ComponentSettings(props: ComponentSettingsProps) {
  const { project, details, onEdit, announce, takeFocus } = props;
  return (
    <div className={styles.settings}>
      <NameField
        project={project}
        details={details}
        onEdit={onEdit}
        announce={announce}
        takeFocus={takeFocus}
      />
      {details.settings.map((setting) => (
        <Setting
          key={setting.key}
          setting={setting}
          announce={announce}
          {...settingCommands({ details, setting, onEdit })}
        />
      ))}
    </div>
  );
}

/** One of the component's settings, and how to save a change to it. */
interface SettingCommandsInput {
  readonly details: ComponentDetails;
  readonly setting: SettingDetails;
  readonly onEdit: (command: EditCommand) => void;
}

/** What a setting's field and its Reset save: commands on this component. */
interface SettingCommands {
  readonly save: (value: unknown) => void;
  readonly reset: () => void;
}

function settingCommands({
  details,
  setting,
  onEdit,
}: SettingCommandsInput): SettingCommands {
  const { componentId, defaultConfig } = details;
  const { key } = setting;
  return {
    save: (value) => {
      onEdit((record) =>
        setComponentSetting(record, { componentId, key, value }),
      );
    },
    reset: () => {
      onEdit((record) =>
        resetComponentSetting(record, { componentId, key, defaultConfig }),
      );
    },
  };
}
