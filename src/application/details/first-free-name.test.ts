import { describe, expect, it } from "vitest";
import { firstFreeName } from "./first-free-name";

describe("firstFreeName", () => {
  // Fails if the first name is anything but the prefix with 1.
  it("starts at 1", () => {
    expect(firstFreeName({ prefix: "workflow", taken: [] })).toBe("workflow-1");
  });

  // Fails if it counts the names in use instead of finding the first number
  // not in use: it would offer "workflow-3" (taken) beside 1 and 3, and
  // "workflow-4" beside 1, 2, and 3 only by luck.
  it("skips names already used, and takes the gap", () => {
    const taken = ["workflow-1", "workflow-3"];
    expect(firstFreeName({ prefix: "workflow", taken })).toBe("workflow-2");
    expect(
      firstFreeName({ prefix: "workflow", taken: [...taken, "workflow-2"] }),
    ).toBe("workflow-4");
  });

  // Fails if a name with another prefix counts as taken.
  it("ignores names with another prefix", () => {
    expect(firstFreeName({ prefix: "lambda", taken: ["rds-1"] })).toBe(
      "lambda-1",
    );
  });
});
