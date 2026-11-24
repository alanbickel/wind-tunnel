import { describe, expect, it } from "vitest";
import {
  frontCalling,
  itemStoreProject,
  storeRead,
} from "../../domain/components/testing/item-store-project";
import type { Project, Step, StepSettings } from "../../domain/model/project";
import type { StepDetails } from "../details/details";
import { itemStoreUseCases } from "../testing/item-store-types";
import { InMemoryProjectRepository } from "../testing/in-memory-project-repository";

// A selected step's request settings (ADR-0024), as DescribeSelection
// reads them over the item store's types: a read takes itemSizeKb
// (default 4 KB) and msPerKb (default 1 ms); a write takes none.

const { describeSelection, changeStep } = itemStoreUseCases(
  new InMemoryProjectRepository(),
);

/** The project, with front · invoke calling `call`. */
function projectWith(call: Step): Project {
  return itemStoreProject(frontCalling(call));
}

/** The store step's details, in a project whose read sets these, or none. */
function storeStepDetails(project: Project): StepDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "step", workflowId: "w", stepId: "store-read" },
  });
  if (details?.kind !== "step") throw new Error("No store-read step");
  return details;
}

/** What a step's Details shows of each setting, and what its field edits. */
function shown(settings?: StepSettings) {
  return storeStepDetails(projectWith(storeRead(settings))).settings.map(
    ({ label, value, defaultNote, defaultMark, editor }) => ({
      label,
      value,
      defaultNote,
      defaultMark,
      editorValue: editor?.value,
      defaultValue: editor?.defaultValue,
    }),
  );
}

describe("DescribeSelection, for a step with request settings", () => {
  // Fails if a step that sets none doesn't show its action's settings, in
  // the descriptors' order, with the defaults as values, each marked as the
  // default and with its default's evidence, or a choice shows its stored
  // value rather than its option's label.
  it("shows each setting at its default, marked as such, when the step sets none", () => {
    expect(shown()).toEqual([
      {
        label: "Item size",
        value: "4 KB",
        defaultNote: "Default 4: an assumption.",
        defaultMark: "Uses the default",
        editorValue: 4,
        defaultValue: 4,
      },
      {
        label: "Read time per KB",
        value: "1 ms",
        defaultNote: "Default 1: an assumption.",
        defaultMark: "Uses the default",
        editorValue: 1,
        defaultValue: 1,
      },
      {
        label: "Consistency",
        value: "Eventually consistent",
        defaultNote: "Default Eventually consistent: an assumption.",
        defaultMark: "Uses the default",
        editorValue: "eventual",
        defaultValue: "eventual",
      },
    ]);
  });

  // Fails if a value the step sets isn't shown, is still marked as the
  // default, or the other setting loses its default.
  it("shows a value the step sets, unmarked, beside the default of one it doesn't", () => {
    const [size, perKb] = shown({ itemSizeKb: 40 });

    expect(size).toMatchObject({
      value: "40 KB",
      defaultMark: undefined,
      editorValue: 40,
      defaultValue: 4,
    });
    expect(perKb).toMatchObject({
      value: "1 ms",
      defaultMark: "Uses the default",
    });
  });

  // Fails if an action that takes no settings (a write), or a step whose
  // component is gone, shows any.
  it("shows none for an action without settings, or a step whose component is gone", () => {
    const write = projectWith({ ...storeRead(), action: "write" });
    expect(storeStepDetails(write).settings).toEqual([]);

    const gone = projectWith({ ...storeRead(), componentId: "nowhere" });
    expect(storeStepDetails(gone).settings).toEqual([]);
  });
});

describe("ChangeStep, for a step with request settings", () => {
  // Fails if the pickers aren't told a step sets request settings, which
  // the change's announcement then can't say are gone.
  it("says whether the step sets any", () => {
    const startOf = (settings?: StepSettings) =>
      changeStep.execute({
        project: projectWith(storeRead(settings)),
        workflowId: "w",
        stepId: "store-read",
      });

    expect(startOf({ itemSizeKb: 40 })?.hasSettings).toBe(true);
    expect(startOf()?.hasSettings).toBe(false);
  });
});
