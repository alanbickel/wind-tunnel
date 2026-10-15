import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { loadProject } from "../persistence/load-project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";

const registry = createAwsComponentRegistry();

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s", (id, template) => {
  it("loads through every validation stage", () => {
    const result = loadProject(template, registry);
    if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
    expect(result.project.id).toBe(id);
  });

  it("places every component on the canvas", () => {
    const ids = template.architecture.components.map((c) => c.id).sort();
    expect(Object.keys(template.layout.nodes).sort()).toEqual(ids);
  });
});

describe("the templates", () => {
  it("share the lunch rush workload, so their results can be compared", () => {
    expect(templateB.workloads).toEqual(templateA.workloads);
  });
});
