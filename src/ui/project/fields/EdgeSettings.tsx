import type {
  EdgeDetails,
  SettingDetails,
} from "../../../application/details/details";
import {
  EDGE_FIELDS,
  type EdgeFieldKey,
} from "../../../application/details/fields/edge-fields";
import {
  resetEdgeSetting,
  setEdgeSetting,
} from "../../../application/edits/edge-edits";
import type { EditCommand } from "../useProjectEdits";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { Setting, type SettingProps } from "./Setting";

export interface EdgeSettingsProps {
  readonly details: EdgeDetails;
  /** Saves a change: a setting, or a reset to its default. */
  readonly onEdit: (command: EditCommand) => void;
  readonly announce: FieldProps["announce"];
}

/**
 * An edge's latency, timeout, and retry policy, each a field that holds a
 * draft and saves it once it passes, with its caller type's default and
 * Reset beside it (UX design §2.1 step 5, §4.3).
 */
export function EdgeSettings({ details, onEdit, announce }: EdgeSettingsProps) {
  return (
    <div className={styles.settings}>
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

/** One of the edge's settings, and how to save a change to it. */
interface SettingCommandsInput {
  readonly details: EdgeDetails;
  readonly setting: SettingDetails;
  readonly onEdit: (command: EditCommand) => void;
}

/** What a setting's field and its Reset save: commands on this edge. */
function settingCommands({
  details,
  setting,
  onEdit,
}: SettingCommandsInput): Pick<SettingProps, "save" | "reset"> {
  const { edgeId, defaults } = details;
  const key = edgeKeyOf(setting);
  return {
    save: (value) => {
      onEdit((record) => setEdgeSetting(record, { edgeId, key, value }));
    },
    reset: () => {
      if (defaults === undefined) return;
      onEdit((record) => resetEdgeSetting(record, { edgeId, key, defaults }));
    },
  };
}

/** The edge setting's key; every setting of an edge's details has one. */
function edgeKeyOf(setting: SettingDetails): EdgeFieldKey {
  const field = EDGE_FIELDS.find((f) => f.key === setting.key);
  if (field === undefined) throw new Error(`No edge setting "${setting.key}".`);
  return field.key;
}
