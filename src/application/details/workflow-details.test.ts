import { describe, expect, it } from "vitest";
import { usedByLine } from "./workflow-details";

describe("usedByLine", () => {
  // Fails if a workflow no workload uses gets an empty "Used by:", or the
  // names lose their order or their commas.
  it("names the workloads with commas, or says there are none", () => {
    expect(usedByLine(["Lunch rush", "Steady day"])).toBe(
      "Used by: Lunch rush, Steady day",
    );
    expect(usedByLine([])).toBe("Used by: no workload yet");
  });

  // Fails if names that have commas of their own are joined with commas,
  // so "Lunch rush, 20 s at 2,000 requests/s" reads as two workloads.
  it("joins names that have commas with semicolons", () => {
    expect(usedByLine(["Lunch rush, 20 s", "Steady day"])).toBe(
      "Used by: Lunch rush, 20 s; Steady day",
    );
  });
});
