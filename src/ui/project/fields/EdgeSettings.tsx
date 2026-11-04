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
import type { Edit } from "../useProjectEdits";
import { inSentence } from "../../shared/in-sentence";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { Setting, type SettingProps } from "./Setting";

export interface EdgeSettingsProps {
  readonly details: EdgeDetails;
  /** Saves a change: a setting, or a reset to its default. */
  readonly onEdit: (edit: Edit) => void;
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
  readonly onEdit: (edit: Edit) => void;
}

/** What a setting's field and its Reset save: commands on this edge. */
function settingCommands({
  details,
  setting,
  onEdit,
}: SettingCommandsInput): Pick<SettingProps, "save" | "reset"> {
  const { edgeId, defaults, sourceName, targetName } = details;
  const key = edgeKeyOf(setting);
  const what = `the ${inSentence(setting.label)} from ${sourceName} to ${targetName}`;
  return {
    save: (value) => {
      onEdit({
        command: (record) => setEdgeSetting(record, { edgeId, key, value }),
        describe: () => `Change ${what}`,
      });
    },
    reset: () => {
      if (defaults === undefined) return;
      onEdit({
        command: (record) =>
          resetEdgeSetting(record, { edgeId, key, defaults }),
        describe: () => `Reset ${what}`,
      });
    },
  };
}

/** The edge setting's key; every setting of an edge's details has one. */
function edgeKeyOf(setting: SettingDetails): EdgeFieldKey {
  const field = EDGE_FIELDS.find((f) => f.key === setting.key);
  if (field === undefined) throw new Error(`No edge setting "${setting.key}".`);
  return field.key;
}
