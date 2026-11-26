import {
  itemStoreDefinition,
  workerPoolDefinition,
} from "../../domain/components/testing/fake-definitions";
import { itemStoreRegistry } from "../../domain/components/testing/item-store-project";
import type {
  DefaultEvidence,
  FieldCatalog,
  TypeFields,
} from "../details/field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "../details/fields/edge-fields";
import type { ProjectRepository } from "../ports/project-repository";
import { ChangeStep } from "../use-cases/change-step";
import { CheckWorkflows } from "../use-cases/check-workflows";
import { CheckWorkloads } from "../use-cases/check-workloads";
import { DescribeSelection } from "../use-cases/describe-selection";
import { NameComponents } from "../use-cases/name-components";
import { SaveProject } from "../use-cases/save-project";
import { SetStepSetting } from "../use-cases/set-step-setting";
import { FixedClock } from "./fixed-clock";

// The test types whose reads take request settings (ADR-0024), with
// descriptors and use cases over them, for tests of a step's request
// settings in layers that can't build a registry, so they don't depend on
// an AWS type's settings, such as DynamoDB's.

/** Every test type's defaults are ours, with nothing behind them. */
const ASSUMED: DefaultEvidence = { level: "assumption", fidelityId: undefined };

/**
 * The item store's descriptors: its write time, and a read's settings, a
 * number of each kind and a choice.
 */
export const itemStoreFields: TypeFields = {
  type: itemStoreDefinition.type,
  purpose: "a store whose reads take request settings.",
  category: "data",
  fields: [
    {
      key: "writeMs",
      label: "Write time",
      unit: "ms",
      kind: "number",
      range: { min: 0, minExclusive: false, max: undefined },
      help: "How long every write takes.",
      evidence: ASSUMED,
    },
  ],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
  requestFields: {
    read: [
      {
        key: "itemSizeKb",
        label: "Item size",
        unit: "KB",
        kind: "whole-number",
        range: { min: 1, minExclusive: false, max: 400 },
        help: "The size of the item a read returns.",
        evidence: ASSUMED,
      },
      {
        key: "msPerKb",
        label: "Read time per KB",
        unit: "ms",
        kind: "number",
        range: { min: 0, minExclusive: false, max: undefined },
        help: "How long each KB of the item takes to read.",
        evidence: ASSUMED,
      },
      {
        key: "consistency",
        label: "Consistency",
        unit: undefined,
        kind: "choice",
        options: [
          { value: "eventual", label: "Eventually consistent" },
          { value: "strong", label: "Strongly consistent" },
        ],
        help: "Whether a read may return a value a recent write has replaced.",
        evidence: ASSUMED,
      },
    ],
  },
};

/** The worker pool's descriptors, which the item store's project calls it from. */
const workerPoolFields: TypeFields = {
  type: workerPoolDefinition.type,
  purpose: "workers with a wait line in front.",
  category: "compute",
  fields: [],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
};

/** The descriptors of the item store's registry. */
export function itemStoreFieldCatalog(): FieldCatalog {
  return new Map(
    [itemStoreFields, workerPoolFields].map((fields) => [fields.type, fields]),
  );
}

/** The use cases a screen showing the item store's project reads and edits it with. */
export interface ItemStoreUseCases {
  readonly describeSelection: DescribeSelection;
  readonly setStepSetting: SetStepSetting;
  readonly changeStep: ChangeStep;
  readonly checkWorkflows: CheckWorkflows;
  readonly checkWorkloads: CheckWorkloads;
  readonly nameComponents: NameComponents;
  readonly saveProject: SaveProject;
}

/**
 * The use cases that read and edit a project over the item store's
 * registry, saving to `projects`.
 */
export function itemStoreUseCases(
  projects: ProjectRepository,
): ItemStoreUseCases {
  const registry = itemStoreRegistry();
  const fields = itemStoreFieldCatalog();
  return {
    describeSelection: new DescribeSelection({ registry, fields }),
    setStepSetting: new SetStepSetting({ registry }),
    changeStep: new ChangeStep({ registry }),
    checkWorkflows: new CheckWorkflows({ registry }),
    checkWorkloads: new CheckWorkloads({ registry }),
    nameComponents: new NameComponents({ registry }),
    saveProject: new SaveProject({
      projects,
      clock: new FixedClock("2026-11-20T12:00:00.000Z"),
      registry,
    }),
  };
}
