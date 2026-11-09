import { describe, expect, it } from "vitest";
import { sampleRecord } from "../testing/sample-record";
import { renameProject } from "./project-edits";

describe("renameProject", () => {
  // Fails if renameProject modifies the input record or fails to preserve other fields like source.
  it("sets the name and leaves the rest of the record, source included, as it was", () => {
    const withSource = {
      ...sampleRecord,
      source: { templateId: "template-a", templateVersion: 1 },
    };
    const renamed = renameProject(withSource, { name: "Orders API" });

    expect(renamed.project.name).toBe("Orders API");
    expect(renamed.source).toEqual(withSource.source);
    expect(renamed.createdAt).toBe(withSource.createdAt);
    expect(renamed.updatedAt).toBe(withSource.updatedAt);
    expect(renamed.layout).toBe(withSource.layout);
    expect(renamed.project.architecture).toBe(withSource.project.architecture);
    expect(renamed.project.workflows).toBe(withSource.project.workflows);
    expect(renamed.project.workloads).toBe(withSource.project.workloads);
    expect(withSource.project.name).toBe(sampleRecord.project.name);
  });

  // Fails if renameProject returns a new object reference when given the existing name.
  it("returns the same record when given the name the project already has", () => {
    const unchanged = renameProject(sampleRecord, {
      name: sampleRecord.project.name,
    });

    expect(unchanged).toBe(sampleRecord);
  });
});
