import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { Project } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { componentNames } from "./component-names";

const registry = createAwsComponentRegistry();
const { project } = sampleRecord;

/** The sample project, with its components renamed by ID. */
function renamed(names: Readonly<Record<string, string>>): Project {
  const components = project.architecture.components.map((c) => ({
    ...c,
    name: names[c.id] ?? c.name,
  }));
  return { ...project, architecture: { ...project.architecture, components } };
}

describe("componentNames", () => {
  // Fails if a component reads as its ID, as findings did before names.
  it("shows a component by its name, not its ID", () => {
    const nameOf = componentNames(project, registry);
    expect(["api", "fn", "table"].map(nameOf)).toEqual([
      "API",
      "Function",
      "Table",
    ]);
  });

  // Fails if the type is added to every name, or to none, or reads as the
  // type's key ("dynamodb") rather than its display name.
  it("adds the type only where components of two types share a name", () => {
    const nameOf = componentNames(
      renamed({ fn: "orders", table: "orders" }),
      registry,
    );
    expect(["api", "fn", "table"].map(nameOf)).toEqual([
      "API",
      "orders (Lambda)",
      "orders (DynamoDB)",
    ]);
  });

  // Fails if an ID the project doesn't have reads as undefined or throws.
  it("reads an ID the project doesn't have as itself", () => {
    expect(componentNames(project, registry)("gone")).toBe("gone");
  });
});
