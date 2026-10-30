import { describe, expect, it } from "vitest";
import {
  createAwsComponentRegistry,
  rdsDefinition,
} from "../../domain/components/aws";
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
    const choices = awsListComponentTypes().execute();

    expect(choices.map((c) => c.type)).toEqual(
      createAwsComponentRegistry()
        .list()
        .map((t) => t.type),
    );
    for (const choice of choices) {
      expect(choice.purpose, choice.type).toMatch(/^[a-z].*\.$/);
    }
  });

  // Fails if a type without descriptors is dropped from the list, or
  // throws, rather than showing without its line.
  it("lists a type with no descriptors, without a line", () => {
    const fields = createFieldCatalog();
    const withoutRds = new Map([...fields].filter(([type]) => type !== "rds"));
    const list = new ListComponentTypes({
      registry: createAwsComponentRegistry(),
      fields: withoutRds,
    });

    const rds = list.execute().find((c) => c.type === "rds");

    expect(rds).toEqual({
      type: "rds",
      displayName: "RDS",
      purpose: undefined,
    });
  });
});

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
    expect(awsNewComponent().execute({ type: "s3" })).toBeUndefined();
  });
});
