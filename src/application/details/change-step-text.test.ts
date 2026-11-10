import { describe, expect, it } from "vitest";
import { changeStepText } from "./change-step-text";

const labels = { fromLabel: "fn-orders · invoke", toLabel: "orders-db · read" };

describe("changeStepText", () => {
  // Fails if Undo's name or the announcement drops either label, or the
  // wording changes (the issue settles it: "Change fn-orders · invoke to
  // orders-db · read").
  it("names the step before and after", () => {
    expect(changeStepText({ ...labels, edge: undefined })).toEqual({
      undoName: "Change fn-orders · invoke to orders-db · read",
      announcement: "Changed fn-orders · invoke to orders-db · read.",
    });
  });

  // Fails if a change along a missing edge doesn't say it added one in both
  // Undo's name and the announcement: the edge appears on the diagram away
  // from the focus.
  it("says the edge it adds", () => {
    const text = changeStepText({
      ...labels,
      edge: { callerName: "api", calleeName: "orders-db" },
    });

    expect(text.undoName).toBe(
      "Change fn-orders · invoke to orders-db · read, and its edge",
    );
    expect(text.announcement).toBe(
      "Changed fn-orders · invoke to orders-db · read. Added the edge from api to orders-db.",
    );
  });
});
