import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";
import { loadProject } from "./load-project";
import { toDocumentIssue, toProjectDocument } from "./project-document-mapper";

const registry = createAwsComponentRegistry();

const load = (input: unknown): ProjectRecord => {
  const result = loadProject(input, registry);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.record;
};

describe("the project document mapper", () => {
  it("round-trips a record through a document and loadProject unchanged", () => {
    const document = toProjectDocument(sampleRecord);
    expect(load(JSON.parse(JSON.stringify(document)))).toStrictEqual(
      sampleRecord,
    );
  });

  it("writes workload times in seconds", () => {
    const workload = toProjectDocument(sampleRecord).workloads[0];
    expect(workload?.durationSec).toBe(5);
    expect(workload?.profile).toEqual([{ atSec: 0, requestsPerSec: 20 }]);
  });

  it.each([
    ["template-a", templateA],
    ["template-b", templateB],
  ])("round-trips %s from its JSON unchanged", (_id, template) => {
    expect(toProjectDocument(load(template))).toStrictEqual(template);
  });

  it("leaves out optional fields the record doesn't have", () => {
    const { id, name, architecture, workflows, workloads } =
      sampleRecord.project;
    const record: ProjectRecord = {
      project: { id, name, architecture, workflows, workloads },
      createdAt: sampleRecord.createdAt,
      updatedAt: sampleRecord.updatedAt,
      layout: sampleRecord.layout,
    };
    const document = toProjectDocument(record);
    expect(Object.keys(document)).not.toContain("description");
    expect(Object.keys(document)).not.toContain("source");
    expect(load(document)).toStrictEqual(record);
  });

  // Fails if an issue's path keeps the domain's field name, which the
  // document doesn't have.
  it("puts an issue in a renamed field at the document's field name", () => {
    const issue = {
      path: ["workloads", 0, "profile", 1, "atMs"],
      message: "m",
    };
    expect(toDocumentIssue(issue)).toEqual({
      path: ["workloads", 0, "profile", 1, "atSec"],
      message: "m",
    });
  });
});
