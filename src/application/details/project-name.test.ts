import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../ports/project-record";
import { checkProjectName, freeProjectName } from "./project-name";

const UPDATED_AT = "2026-10-17T12:00:00.000Z";

/** A saved project of the name, for the list a name is checked against. */
function summary(id: string, name: string): ProjectSummary {
  return { id, name, updatedAt: UPDATED_AT };
}

const projects = [summary("orders", "Orders API"), summary("pay", "Payments")];

const TAKEN = {
  status: "fails",
  message:
    "Another project already uses this name. Please choose another name.",
};

describe("checkProjectName", () => {
  // Fails if spaces around a name are kept.
  it("drops the spaces around a name", () => {
    expect(checkProjectName({ text: "  Checkout  ", projects })).toEqual({
      status: "passes",
      value: "Checkout",
    });
  });

  // Fails if an empty name, or one of only spaces, passes.
  it.each(["", "   "])("refuses the empty name %j", (text) => {
    expect(checkProjectName({ text, projects })).toEqual({
      status: "fails",
      message: "A project needs a name.",
    });
  });

  // Fails if names are compared by case, or with their spaces, so a
  // name that reads the same as another's passes.
  it.each(["Orders API", "orders api", "  ORDERS API "])(
    "refuses %j, which another project uses",
    (text) => {
      expect(checkProjectName({ text, projects })).toEqual(TAKEN);
    },
  );

  // Fails if a stored name with spaces around it doesn't clash.
  it("compares a stored name without its spaces", () => {
    const spaced = [summary("spaced", " Checkout ")];
    expect(checkProjectName({ text: "checkout", projects: spaced })).toEqual(
      TAKEN,
    );
  });

  // Fails if the project being named counts against itself, so a rename
  // (#113) that keeps the name, or changes only its case, is refused.
  it("accepts the project's own name", () => {
    expect(
      checkProjectName({ text: "orders api", projects, projectId: "orders" }),
    ).toEqual({ status: "passes", value: "orders api" });
    expect(
      checkProjectName({ text: "Payments", projects, projectId: "orders" }),
    ).toEqual(TAKEN);
  });
});

describe("freeProjectName", () => {
  // Fails if a free name is numbered anyway.
  it("keeps a name no project uses", () => {
    expect(freeProjectName("Checkout", projects)).toBe("Checkout");
  });

  // Fails if a taken name is kept, or numbering starts anywhere but 2.
  it("numbers a taken name from 2", () => {
    expect(freeProjectName("Orders API", projects)).toBe("Orders API (2)");
  });

  // Fails if a taken number is reused, or the case of "(2)" is checked
  // apart from the rest of the name.
  it("skips numbers already taken", () => {
    const taken = [...projects, summary("o2", "orders api (2)")];
    expect(freeProjectName("Orders API", taken)).toBe("Orders API (3)");
  });
});
