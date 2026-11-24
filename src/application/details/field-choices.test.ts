import { describe, expect, it } from "vitest";
import * as aws from "../../domain/components/aws";
import type { RequestSettingsSchemas } from "../../domain/components/component-definition";
import {
  itemStoreDefinition,
  workerPoolDefinition,
} from "../../domain/components/testing/fake-definitions";
import { settingChoices } from "../../domain/components/testing/setting-choices";
import type { StepAction } from "../../domain/model/project";
import { itemStoreFieldCatalog } from "../testing/item-store-types";
import { createFieldCatalog } from "./create-field-catalog";
import type {
  ChoiceFieldDescriptor,
  ConfigFieldDescriptor,
  FieldCatalog,
  TypeFields,
} from "./field-descriptor";

// The schemas stay the authority; a choice descriptor's options only label
// their values. These check that the two agree: the options' values are
// exactly the values the schema's enum allows, no more and no fewer.

/** What a check needs of a component definition: its schemas. */
interface DefinedType {
  readonly type: string;
  readonly configSchema: unknown;
  readonly requestSettings?: RequestSettingsSchemas;
}

/** A catalog of descriptors, and the definitions of the types they describe. */
interface DescribedTypes {
  readonly catalog: FieldCatalog;
  readonly definitions: readonly DefinedType[];
}

/** One choice descriptor, and the schema whose enum it labels. */
interface ChoiceUnderTest {
  readonly name: string;
  /** Undefined if the type, or its action's settings, has none. */
  readonly schema: unknown;
  readonly field: ChoiceFieldDescriptor;
}

/** Every AWS definition: each of the module's exports but its registry factory. */
const awsDefinitions: DefinedType[] = Object.values(aws).flatMap((value) =>
  typeof value === "function" ? [] : [value],
);

/** The choice descriptors among `fields`. */
function choicesOf(
  fields: readonly ConfigFieldDescriptor[],
): ChoiceFieldDescriptor[] {
  return fields.flatMap((field) => (field.kind === "choice" ? [field] : []));
}

/** A type's choices: its config's, then each action's request settings'. */
function typeChoices(
  { type, fields, requestFields = {} }: TypeFields,
  definition: DefinedType | undefined,
): ChoiceUnderTest[] {
  const config = choicesOf(fields).map((field) => ({
    name: `${type} ${field.key}`,
    schema: definition?.configSchema,
    field,
  }));
  const requests = Object.entries(requestFields).flatMap(([action, list]) =>
    choicesOf(list).map((field) => ({
      name: `${type} ${action} ${field.key}`,
      schema: definition?.requestSettings?.[action as StepAction],
      field,
    })),
  );
  return [...config, ...requests];
}

/**
 * Every choice descriptor, with its schema: the AWS types', and the test
 * item store's, so the check runs before any AWS type has a choice (DDB-1,
 * #301, is the first).
 */
const choiceFields = (
  [
    { catalog: createFieldCatalog(), definitions: awsDefinitions },
    {
      catalog: itemStoreFieldCatalog(),
      definitions: [itemStoreDefinition, workerPoolDefinition],
    },
  ] satisfies DescribedTypes[]
).flatMap(({ catalog, definitions }) =>
  [...catalog.values()].flatMap((fields) =>
    typeChoices(
      fields,
      definitions.find((d) => d.type === fields.type),
    ),
  ),
);

describe("each choice setting's options", () => {
  // Fails if a choice's options aren't exactly its schema's enum values: e.g.
  // the item store's "strong" option written as "linear", one left out, or
  // a choice over a setting the schema doesn't make an enum.
  it.each(
    choiceFields.map(
      ({ name, schema, field }) => [name, schema, field] as const,
    ),
  )("%s are its schema's values", (_name, schema, field) => {
    const values = settingChoices(schema, field.key);

    expect(values, "the schema's setting isn't an enum").toBeDefined();
    expect(field.options.map((option) => option.value).sort()).toEqual(
      [...(values ?? [])].sort(),
    );
  });
});
