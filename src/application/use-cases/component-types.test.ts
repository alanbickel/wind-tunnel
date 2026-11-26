import { describe, expect, it } from "vitest";
import {
  createAwsComponentRegistry,
  rdsDefinition,
} from "../../domain/components/aws";
import {
  COMPONENT_CATEGORIES,
  type ComponentCategory,
} from "../details/component-category";
import { createFieldCatalog } from "../details/create-field-catalog";
import {
  awsListComponentTypes,
  awsNewComponent,
} from "../testing/aws-component-types";
import { ListComponentTypes } from "./list-component-types";

describe("ListComponentTypes", () => {
  // Fails if a registered type has no line on what it's for: a new type
  // registered without its descriptors, or with an empty purpose.
  it("gives every registered type a line on what it's for", () => {
    const choices = allChoices(awsListComponentTypes());

    expect(choices.map((c) => c.type).sort()).toEqual(
      createAwsComponentRegistry()
        .list()
        .map((t) => t.type)
        .sort(),
    );
    for (const choice of choices) {
      expect(choice.purpose, choice.type).toMatch(/^[a-z].*\.$/);
    }
  });

  // Fails if a registered type's descriptors have no category, or one not
  // in the closed list: it would show with no heading, or not at all.
  it("gives every registered type a category from the list", () => {
    const known = COMPONENT_CATEGORIES.map((c) => c.category);
    const fields = createFieldCatalog();

    for (const { type } of createAwsComponentRegistry().list()) {
      expect(known, type).toContain(fields.get(type)?.category);
    }
  });

  // Fails if the groups come out of the list's order, a category with no
  // types is shown, or a group's types aren't in order of display name.
  it("groups types in the list's order, by display name within a group", () => {
    const groups = awsListComponentTypes().execute();

    expect(
      groups.map((g) => [g.heading, g.types.map((t) => t.displayName)]),
    ).toEqual([
      ["Front door", ["API Gateway"]],
      ["Compute", ["Lambda"]],
      ["Integration", ["SQS"]],
      ["Data", ["DynamoDB", "RDS", "S3"]],
    ]);
  });

  // Fails if a type without descriptors is dropped from the list, or
  // throws, rather than showing without its line, in a last group with no
  // heading.
  it("lists a type with no descriptors last, with no heading or line", () => {
    const fields = createFieldCatalog();
    const withoutRds = new Map([...fields].filter(([type]) => type !== "rds"));
    const list = new ListComponentTypes({
      registry: createAwsComponentRegistry(),
      fields: withoutRds,
    });

    const groups = list.execute();

    expect(groups.at(-1)).toEqual({
      heading: undefined,
      types: [{ type: "rds", displayName: "RDS", purpose: undefined }],
    });
    expect(groups.find((g) => g.heading === "Data")?.types).toHaveLength(2);
  });

  // Fails if a type whose category isn't in the closed list is dropped, as
  // when the last group takes only types with no descriptors, rather than
  // showing it in the last group with no heading.
  it("lists a type with a category not in the list last, with no heading", () => {
    const fields = createFieldCatalog();
    const rds = fields.get("rds");
    if (rds === undefined) throw new Error("rds has no descriptors");
    const unlisted = new Map(fields).set("rds", {
      ...rds,
      category: "nope" as ComponentCategory,
    });
    const list = new ListComponentTypes({
      registry: createAwsComponentRegistry(),
      fields: unlisted,
    });

    const groups = list.execute();

    expect(groups.at(-1)).toMatchObject({
      heading: undefined,
      types: [{ type: "rds", displayName: "RDS" }],
    });
    expect(groups.find((g) => g.heading === "Data")?.types).toHaveLength(2);
  });
});

function allChoices(list: ListComponentTypes) {
  return list.execute().flatMap((group) => group.types);
}

describe("NewComponent", () => {
  // Fails if the input takes its id from anywhere but the generator, or
  // its settings from anything but the type's defaultConfig.
  it("gives a new id and the type's default settings", () => {
    const newComponent = awsNewComponent();

    expect(newComponent.execute({ type: "rds" })).toEqual({
      componentId: "new-1",
      type: "rds",
      defaultConfig: rdsDefinition.defaultConfig,
    });
    expect(newComponent.execute({ type: "rds" })?.componentId).toBe("new-2");
  });

  // Fails if an unknown type makes an input, which would add a component
  // that the save's architecture check refuses.
  it("makes nothing for a type the registry doesn't have", () => {
    expect(awsNewComponent().execute({ type: "elasticache" })).toBeUndefined();
  });
});
