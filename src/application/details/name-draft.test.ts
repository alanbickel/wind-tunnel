import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { checkComponentName } from "./name-draft";

/** The sample project with a second DynamoDB table, "Orders". */
const project: Project = {
  ...sampleRecord.project,
  architecture: {
    ...sampleRecord.project.architecture,
    components: [
      ...sampleRecord.project.architecture.components,
      { id: "orders", type: "dynamodb", name: "Orders", config: {} },
    ],
  },
};

/** The table component's name field, with `text` typed in it. */
function checkTableName(text: string) {
  return checkComponentName({
    project,
    componentId: "table",
    text,
    typeName: "DynamoDB",
  });
}

describe("checkComponentName", () => {
  // Fails if a name another component of the type uses passes: saving it
  // would break validateComponents' rule.
  it("refuses a name another component of its type uses", () => {
    expect(checkTableName("Orders")).toEqual({
      status: "fails",
      message:
        "Another DynamoDB component already uses this name. Please choose another name.",
    });
  });

  // Fails if names are unique across types, not within one, or the
  // component's own name counts against it.
  it("allows another type's name, and its own", () => {
    expect(checkTableName("Function")).toEqual({
      status: "passes",
      value: "Function",
    });
    expect(checkTableName("Table")).toEqual({
      status: "passes",
      value: "Table",
    });
  });

  // Fails if an empty name, or one of only spaces, passes, or spaces
  // around a name are kept.
  it("refuses an empty name, and trims spaces", () => {
    expect(checkTableName("  ")).toEqual({
      status: "fails",
      message: "A component needs a name.",
    });
    expect(checkTableName(" orders-table ")).toEqual({
      status: "passes",
      value: "orders-table",
    });
  });
});
