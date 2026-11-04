import { describe, expect, it } from "vitest";
import { USAGE, parseArguments } from "../../../scripts/ai-dlc/arguments.js";
import { FAILED } from "../../../scripts/ai-dlc/stop.js";

describe("parseArguments", () => {
  // Fails if the issues lose their order or a flag is misread.
  it("reads the issues in order and the flags", () => {
    expect(parseArguments(["120", "--merge", "119"])).toEqual({
      issues: [120, 119],
      flags: { merge: true, deferManualChecks: false },
    });
  });

  // Fails if a mistyped flag is ignored, so a run meant to defer checks runs without.
  it("stops on an unknown flag", () => {
    expect(() => parseArguments(["120", "--defer"])).toThrow(
      expect.objectContaining({ code: FAILED, message: USAGE }),
    );
  });

  // Fails if a run with no issues does nothing and exits 0.
  it("stops when no issue is given", () => {
    expect(() => parseArguments(["--merge"])).toThrow(USAGE);
  });

  // Fails if a non-numeric issue reaches gh as NaN.
  it("stops on an issue that isn't a number", () => {
    expect(() => parseArguments(["12a"])).toThrow(USAGE);
  });
});
