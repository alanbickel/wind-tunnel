import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { distributionSchema } from "../../domain/random/distribution";
import { createFieldCatalog } from "./create-field-catalog";
import { DISTRIBUTION_KINDS, DISTRIBUTION_PARTS } from "./distribution-parts";
import type { FieldRange } from "./field-descriptor";

// The schemas stay the authority (UX design §5); a descriptor's range only
// words the messages. These check that the two agree: each end of a range
// passes the schema, and a value just past it fails.

const registry = createAwsComponentRegistry();

/** A value just past a range's end: a whole step for whole numbers. */
function stepOf(wholeNumber: boolean): number {
  return wholeNumber ? 1 : 0.001;
}

/** Values a range allows, at its ends, and values just outside them. */
interface RangeEnds {
  readonly inside: readonly number[];
  readonly outside: readonly number[];
}

/** The lowest value allowed, the highest (or a large one), and just past each. */
function endsOf(range: FieldRange, wholeNumber: boolean): RangeEnds {
  const step = stepOf(wholeNumber);
  const lowest = range.minExclusive ? range.min + step : range.min;
  const belowLowest = range.minExclusive ? range.min : range.min - step;
  const top =
    range.max === undefined
      ? { inside: [1e9], outside: [] as number[] }
      : { inside: [range.max], outside: [range.max + step] };
  const fraction = wholeNumber ? [lowest + 0.5] : [];
  return {
    inside: [lowest, ...top.inside],
    outside: [belowLowest, ...top.outside, ...fraction],
  };
}

const numberFields = [...createFieldCatalog().values()].flatMap(
  ({ type, fields }) =>
    fields.flatMap((field) =>
      field.kind === "distribution" ? [] : [{ type, field }],
    ),
);

describe("each number setting's range", () => {
  // Fails if a range in application/details/fields/ disagrees with its
  // type's config schema: e.g. RDS queryWorkers at min 0, or SQS's
  // consumer concurrency without its max of 1,000.
  it.each(
    numberFields.map(
      ({ type, field }) => [`${type} ${field.key}`, type, field] as const,
    ),
  )("%s agrees with its schema", (_name, typeName, field) => {
    const type = registry.get(typeName);
    if (type === undefined) throw new Error(`no type "${typeName}"`);
    const issuesAt = (value: number) =>
      type
        .checkConfig({
          ...(type.defaultConfig as object),
          [field.key]: value,
        })
        .filter((issue) => issue.path[0] === field.key);
    const { inside, outside } = endsOf(
      field.range,
      field.kind === "whole-number",
    );

    for (const value of inside)
      expect(issuesAt(value), String(value)).toEqual([]);
    for (const value of outside) {
      expect(issuesAt(value), String(value)).not.toEqual([]);
    }
  });
});

describe("each distribution part's range", () => {
  const parts = DISTRIBUTION_KINDS.flatMap((kind) =>
    DISTRIBUTION_PARTS[kind].map((part) => ({ kind, part })),
  );

  // Fails if a part's range disagrees with distributionSchema: e.g. a
  // constant's value at more than 0, or a median allowed to be 0.
  it.each(
    parts.map(({ kind, part }) => [`${kind} ${part.key}`, kind, part] as const),
  )("%s agrees with the schema", (_name, kind, part) => {
    const passes = (value: number) => {
      // Every part at the same value keeps a lognormal's p99 rule out of it.
      const values = DISTRIBUTION_PARTS[kind].map((p) => [p.key, value]);
      return distributionSchema.safeParse({
        kind,
        ...Object.fromEntries(values),
      }).success;
    };
    const { inside, outside } = endsOf(part.range, false);

    for (const value of inside) expect(passes(value), String(value)).toBe(true);
    for (const value of outside)
      expect(passes(value), String(value)).toBe(false);
  });

  // Fails if a kind is added to distributionSchema without parts here, so
  // its field would have nothing to edit.
  it("covers every kind the schema has", () => {
    const schemaKinds = distributionSchema.options.map(
      (option) => option.shape.kind.value,
    );
    expect([...DISTRIBUTION_KINDS].sort()).toEqual([...schemaKinds].sort());
  });
});
