import { describe, expect, it } from "vitest";
import {
  changeStepQuestion,
  changeStepText,
  type ChangeStepTextInput,
} from "./change-step-text";

const labels: ChangeStepTextInput = {
  fromLabel: "fn-orders · invoke",
  toLabel: "orders-db · read",
  stepsBelow: 0,
  toEnqueue: false,
};

describe("changeStepText", () => {
  // Fails if Undo's name or the announcement drops either label, or the
  // wording changes (the issue settles it: "Change fn-orders · invoke to
  // orders-db · read").
  it("names the step before and after", () => {
    expect(changeStepText(labels)).toEqual({
      undoName: "Change fn-orders · invoke to orders-db · read",
      announcement: "Changed fn-orders · invoke to orders-db · read.",
    });
  });

  // Fails if Undo's name or the announcement doesn't count the steps that
  // go (or says "steps" for one).
  it("says how many steps under it go", () => {
    const three = changeStepText({ ...labels, stepsBelow: 3 });
    expect(three.undoName).toBe(
      "Change fn-orders · invoke to orders-db · read, and remove the 3 steps under it",
    );
    expect(three.announcement).toBe(
      "Changed fn-orders · invoke to orders-db · read. The 3 steps under it are gone.",
    );
    const one = changeStepText({ ...labels, stepsBelow: 1 });
    expect(one.undoName).toBe(
      "Change fn-orders · invoke to orders-db · read, and remove the 1 step under it",
    );
    expect(one.announcement).toBe(
      "Changed fn-orders · invoke to orders-db · read. The 1 step under it is gone.",
    );
  });

  // Fails if a change to `enqueue` doesn't say there's a slot to fill, or
  // another change says so.
  it("says an enqueue has no async work yet", () => {
    const text = changeStepText({ ...labels, toEnqueue: true });

    expect(text.announcement).toBe(
      "Changed fn-orders · invoke to orders-db · read. It has no async work yet.",
    );
    expect(text.undoName).toBe("Change fn-orders · invoke to orders-db · read");
  });
});

describe("changeStepQuestion", () => {
  // Fails if the question counts anything but every step under the step,
  // or is asked when nothing is under it.
  it("asks with the count, and not at all when nothing is under the step", () => {
    expect(changeStepQuestion({ ...labels, stepsBelow: 3 })?.question).toBe(
      "Change fn-orders · invoke to orders-db · read? The 3 steps under it go.",
    );
    expect(changeStepQuestion({ ...labels, stepsBelow: 1 })?.question).toBe(
      "Change fn-orders · invoke to orders-db · read? The 1 step under it goes.",
    );
    expect(changeStepQuestion(labels)).toBeUndefined();
  });
});
