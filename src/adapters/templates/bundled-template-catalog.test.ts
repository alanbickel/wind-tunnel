import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import {
  BundledTemplateCatalog,
  createBundledTemplateCatalog,
} from "./bundled-template-catalog";
import templateA from "./template-a.json";

const registry = createAwsComponentRegistry();
const catalog = createBundledTemplateCatalog(registry);

describe("BundledTemplateCatalog", () => {
  it("lists the bundled templates in order, by document ID", async () => {
    const summaries = await catalog.list();
    expect(summaries.map((s) => [s.id, s.version])).toEqual([
      ["template-a", 1],
      ["template-b", 1],
    ]);
    expect(summaries[0]).toEqual({
      id: "template-a",
      version: 1,
      name: templateA.name,
      description: templateA.description,
    });
  });

  it("returns a template as a record whose source names it", async () => {
    const record = await catalog.get("template-b");
    expect(record?.project.id).toBe("template-b");
    expect(record?.source).toEqual({
      templateId: "template-b",
      templateVersion: 1,
    });
  });

  it("returns undefined for an unknown ID", async () => {
    expect(await catalog.get("template-z")).toBeUndefined();
  });

  it("refuses an invalid template when it's created, naming the problem", () => {
    const broken = { ...templateA, workloads: "none" };
    expect(
      () =>
        new BundledTemplateCatalog({
          templates: [{ version: 1, document: broken }],
          registry,
        }),
    ).toThrow(/A bundled template is invalid: workloads: /);
  });
});
