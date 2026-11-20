import { describe, expect, it } from "vitest";
import type { Step } from "../model/project";
import { findRunIssues } from "./find-run-issues";
import {
  frontCalling,
  itemStoreProject,
  itemStoreRegistry,
  storeRead,
} from "./testing/item-store-project";

// The request settings checks (ADR-0024 decision 4). The other step checks
// are tested through `findRunIssues` in its own test file.

/** The issues of the workflow "w", whose root is `root`. */
const stepIssues = (root: Step) =>
  findRunIssues(itemStoreProject(root), itemStoreRegistry()).workflows.get("w");

/** The path to `store-read`, the first call of the root. */
const READ_PATH = ["workflows", 0, "root", "calls", 0];

describe("findStepIssues: request settings", () => {
  // Fails if a step's valid settings, or its absence of them, are reported.
  it("accepts settings that fit, and a step that sets none", () => {
    expect(stepIssues(frontCalling(storeRead({ itemSizeKb: 40 })))).toEqual([]);
    expect(stepIssues(frontCalling(storeRead()))).toEqual([]);
  });

  // Fails if checkSettings stops reporting a value the schema rejects, or its path into the settings.
  it("reports a value out of range, with the path to the setting", () => {
    const [issue, ...rest] =
      stepIssues(frontCalling(storeRead({ itemSizeKb: 401 }))) ?? [];
    expect(rest).toEqual([]);
    expect(issue).toEqual({
      kind: "invalid-request-settings",
      path: [...READ_PATH, "settings", "itemSizeKb"],
      settingPath: ["itemSizeKb"],
      componentId: "store",
      action: "read",
      message: expect.stringContaining("400") as string,
    });
  });

  // Fails if the action's schema stops being strict, so an unknown key passes.
  it("reports a key the action doesn't take, at the settings", () => {
    const issues = stepIssues(frontCalling(storeRead({ colour: "red" })));
    expect(issues?.map((i) => [i.kind, i.path])).toEqual([
      ["invalid-request-settings", [...READ_PATH, "settings"]],
    ]);
  });

  // Fails if settings on an action with no schema aren't checked, e.g. if checkSettings is skipped when the type declares none for the action.
  it("reports settings on an action that takes none", () => {
    const write: Step = {
      id: "store-write",
      componentId: "store",
      action: "write",
      settings: { itemSizeKb: 4 },
    };
    const issues = stepIssues(frontCalling(write));
    expect(issues?.map((i) => [i.kind, i.path])).toEqual([
      ["invalid-request-settings", [...READ_PATH, "settings"]],
    ]);
  });

  // Fails if settings are checked when the action isn't accepted, adding a second issue to the step.
  it("doesn't check settings on an action the type doesn't accept", () => {
    const invoke: Step = { ...storeRead({ colour: "red" }), action: "invoke" };
    const issues = stepIssues(frontCalling(invoke));
    expect(issues?.map((i) => i.kind)).toEqual(["action-not-accepted"]);
  });

  // Fails if a step whose component is gone gets more than its
  // unknown-component issue, e.g. if checkTarget went on past it.
  it("gives a step whose component is gone only its unknown-component issue", () => {
    const ghost: Step = { ...storeRead({ colour: "red" }), componentId: "x" };
    const issues = stepIssues(frontCalling(ghost));
    expect(issues?.map((i) => i.kind)).toEqual(["unknown-component"]);
  });
});
