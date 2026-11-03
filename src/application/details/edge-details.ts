import type { EdgeSettings } from "../../domain/model/edge-settings";
import type { Edge, Project } from "../../domain/model/project";
import { stepsAlong } from "./called-by";
import type { EdgeDetails, SettingDetails } from "./details";
import type { EdgeEvidence } from "./field-descriptor";
import {
  EDGE_FIELDS,
  withEvidence,
  type EdgeFieldDescriptor,
} from "./fields/edge-fields";
import { nameOf } from "./name-of";
import { edgeRemovalText } from "./removal-text";
import { defaultNote, settingValueText } from "./setting-text";

/** An edge, and what its caller's type says of a new edge's settings. */
export interface EdgeDetailsInput {
  readonly project: Project;
  readonly edge: Edge;
  /** The caller type's `edgeDefaults`; undefined if its type isn't known. */
  readonly defaults: EdgeSettings | undefined;
  /** The caller type's `edgeEvidence`; undefined if it has no descriptors. */
  readonly evidence: EdgeEvidence | undefined;
}

/**
 * An edge's details: the components it joins, by name, its settings as
 * their descriptors read them, each with its caller type's default (UX
 * design §5), the steps that call along it, and what removing it would
 * take. Without the caller type's defaults and evidence, its settings are
 * read-only.
 */
export function edgeDetails(input: EdgeDetailsInput): EdgeDetails {
  const { project, edge, defaults } = input;
  return {
    kind: "edge",
    edgeId: edge.id,
    sourceName: nameOf(project, edge.from),
    targetName: nameOf(project, edge.to),
    settings: EDGE_FIELDS.map((field) => edgeSetting({ ...input, field })),
    calledAlongBy: stepsAlong(project, edge),
    defaults,
    removal: edgeRemovalText(project, edge),
  };
}

interface EdgeSettingInput extends EdgeDetailsInput {
  readonly field: EdgeFieldDescriptor;
}

/** One of the edge's settings, editable if its default is known. */
function edgeSetting(input: EdgeSettingInput): SettingDetails {
  const { edge, field, defaults, evidence } = input;
  const value = edge[field.key];
  const shown = {
    key: field.key,
    label: field.label,
    value: settingValueText(field, value),
    help: field.help,
  };
  if (defaults === undefined || evidence === undefined) {
    return { ...shown, defaultNote: undefined, editor: undefined };
  }
  const defaultValue = defaults[field.key];
  const fieldEvidence = evidence[field.key];
  return {
    ...shown,
    defaultNote: defaultNote({
      field,
      value: defaultValue,
      evidence: fieldEvidence,
    }),
    editor: { field: withEvidence(field, fieldEvidence), value, defaultValue },
  };
}
