import { describe, expect, it } from "vitest";
import {
  frontCalling,
  itemStoreProject,
  itemStoreRegistry,
  storeRead,
} from "../../domain/components/testing/item-store-project";
import type { Step, StepSettings } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { findStep } from "./step-search";
import { setStepSetting, type StepSettingChange } from "./step-setting-edits";

// The item store's project: front · invoke calls store · read along
// front → store. A read takes itemSizeKb (a whole number, 1 to 400,
// default 4) and msPerKb (default 1); a write takes no settings.

const registry = itemStoreRegistry();

/** A record of the item store's project whose call is `call`. */
function recordWith(call: Step): ProjectRecord {
  return { ...sampleRecord, project: itemStoreProject(frontCalling(call)) };
}

/** The store step's read, setting these, or none. */
function recordReading(settings?: StepSettings): ProjectRecord {
  return recordWith(storeRead(settings));
}

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

/** `setStepSetting` on the store's step, "store-read" in the workflow "w". */
function set(
  record: ProjectRecord,
  change: Omit<StepSettingChange, "workflowId" | "stepId">,
): ProjectRecord {
  return setStepSetting(record, {
    workflowId: "w",
    stepId: "store-read",
    registry,
    ...change,
  });
}

/** The store step as the record has it. */
function storeStep(record: ProjectRecord): Step | undefined {
  const [workflow] = record.project.workflows;
  return workflow && findStep(workflow, "store-read");
}

describe("setStepSetting", () => {
  // Fails if the value isn't stored on the step, a value the step didn't
  // set is stored with it (the step stores only what it sets), the input
  // record is changed, or anything but the step changes.
  it("stores the value on the step, and nothing else", () => {
    const before = recordReading();
    const copy = copyOf(before);

    const after = set(before, { key: "itemSizeKb", value: 40 });

    expect(storeStep(after)).toEqual(storeRead({ itemSizeKb: 40 }));
    expect(before).toEqual(copy);
    expect(after.project.architecture).toBe(before.project.architecture);
    expect(after.project.workloads).toBe(before.project.workloads);
  });

  // Fails if setting a second value drops the first, or a new value
  // doesn't replace the old one.
  it("keeps the step's other settings, and replaces the one it changes", () => {
    const before = recordReading({ itemSizeKb: 40, msPerKb: 2 });

    const after = set(before, { key: "msPerKb", value: 3 });

    expect(storeStep(after)?.settings).toEqual({ itemSizeKb: 40, msPerKb: 3 });
  });

  // Fails if a value equal to the default is stored (ADR-0024 decision
  // 2.2), or the step keeps an empty `settings` once none is left.
  it("stores nothing for the default, and drops settings when none is left", () => {
    const both = recordReading({ itemSizeKb: 40, msPerKb: 2 });

    const one = set(both, { key: "itemSizeKb", value: 4 });
    expect(storeStep(one)?.settings).toEqual({ msPerKb: 2 });

    const none = set(one, { key: "msPerKb", value: 1 });
    expect(storeStep(none)).toEqual(storeRead());
    expect(storeStep(none)).not.toHaveProperty("settings");
  });

  // Fails if the command stores a value the action's schema refuses
  // (over the max, not a whole number, the wrong kind), or a key the
  // action doesn't have, or a setting on an action that takes none.
  it.each([
    ["over the max", "itemSizeKb", 401],
    ["a fraction", "itemSizeKb", 4.5],
    ["not a number", "msPerKb", "fast"],
    ["a key the read doesn't have", "colour", 1],
  ])("refuses %s, returning the record as it was", (_name, key, value) => {
    const before = recordReading({ msPerKb: 2 });

    expect(set(before, { key, value })).toBe(before);
  });

  // Fails if an action that takes no settings (the store's write) accepts
  // one, or a step whose component is gone is changed.
  it("changes nothing for an action without settings, or a component that's gone", () => {
    const write = recordWith({ ...storeRead(), action: "write" });
    expect(set(write, { key: "itemSizeKb", value: 40 })).toBe(write);

    const gone = recordWith({ ...storeRead(), componentId: "nowhere" });
    expect(set(gone, { key: "itemSizeKb", value: 40 })).toBe(gone);
  });

  // Fails if a step's other setting, stored wrong, blocks fixing or setting
  // this one: only the changed key's issues refuse a change.
  it("lets one setting change while another is stored wrong", () => {
    const before = recordReading({ msPerKb: -1 });

    const after = set(before, { key: "itemSizeKb", value: 40 });

    expect(storeStep(after)?.settings).toEqual({ msPerKb: -1, itemSizeKb: 40 });
  });

  // Fails if setting what the step already has makes a new record, which
  // would save, and add an undo step, for nothing.
  it("returns the record as it was when nothing changes", () => {
    const set40 = recordReading({ itemSizeKb: 40 });
    expect(set(set40, { key: "itemSizeKb", value: 40 })).toBe(set40);

    const unset = recordReading();
    expect(set(unset, { key: "itemSizeKb", value: 4 })).toBe(unset);
  });
});
