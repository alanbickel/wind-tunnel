import { describe, expect, it } from "vitest";
import { messageText } from "../../testing/sample-findings";
import { sampleRecord } from "../../testing/sample-record";
import { createFindingsCatalog } from "./catalog/create-findings-catalog";
import type { FindingsCatalog, TypeAdvice } from "./catalog/type-advice";
import { createDetectors } from "./create-detectors";
import { createPhrasebook } from "./create-phrasebook";
import type { Detector } from "./detector";
import { say } from "./message";
import type { Phrase, Phrases, Statement } from "./phrase";

/** A statement that names one of table's limits and one of its reasons. */
interface NamedStatement extends Statement {
  readonly kind: "named";
  readonly componentId: string;
}

const NAMED: Phrase<NamedStatement> = {
  long: ({ componentId }, v) =>
    say`${v.limit({ componentId, id: "readUnits" })} refuses with ${v.reason({ componentId, id: "throttled" })}.`,
  short: ({ componentId }, v) =>
    say`${v.limit({ componentId, id: "readUnits" })}, ${v.reason({ componentId, id: "throttled" })}`,
};

/** A detector that finds nothing, registering the phrases given. */
function detectorWith(phrases: Phrases<NamedStatement>): Detector {
  return { id: "named", detect: () => [], phrases };
}

const named = detectorWith({ named: NAMED });

/** DynamoDB's words for its read bucket and its throttling, and no other. */
const dynamoDb: TypeAdvice = {
  type: "dynamodb",
  limits: {},
  kinds: {},
  wording: {
    reasons: { throttled: { long: "throttling", short: "throttled" } },
    limits: { readUnits: { long: "read capacity", short: "reads" } },
  },
};

/** The phrasebook for `sampleRecord`'s project, whose `table` is DynamoDB. */
function phrasebookWith(catalog: FindingsCatalog) {
  return createPhrasebook({
    project: sampleRecord.project,
    detectors: [named],
    catalog,
  });
}

describe("createPhrasebook", () => {
  // Fails if the type's words aren't looked up by the component's type, or
  // the length asked for doesn't pick the words of that length.
  it("words a type's reasons and limits as the type registers them", () => {
    const phrasebook = phrasebookWith(new Map([["dynamodb", dynamoDb]]));
    const statement: NamedStatement = { kind: "named", componentId: "table" };
    expect(messageText(phrasebook.word(statement, "long"))).toBe(
      "read capacity refuses with throttling.",
    );
    expect(messageText(phrasebook.word(statement, "short"))).toBe(
      "reads, throttled",
    );
  });

  // Fails if a type that registers nothing, or a component with no type in
  // the project, prints anything but the raw IDs.
  it.each([
    { what: "a type with no wording", componentId: "table" },
    { what: "a component the project doesn't have", componentId: "gone" },
  ])("prints the raw IDs for $what", ({ componentId }) => {
    const phrasebook = phrasebookWith(new Map());
    const statement: NamedStatement = { kind: "named", componentId };
    expect(messageText(phrasebook.word(statement, "long"))).toBe(
      "readUnits refuses with throttled.",
    );
  });

  // Fails if an ID the type doesn't register is worded with another's
  // words.
  it("prints the raw ID for an ID its type doesn't register", () => {
    const phrasebook = phrasebookWith(
      new Map([
        ["dynamodb", { ...dynamoDb, wording: { reasons: {}, limits: {} } }],
      ]),
    );
    const statement: NamedStatement = { kind: "named", componentId: "table" };
    expect(messageText(phrasebook.word(statement, "short"))).toBe(
      "readUnits, throttled",
    );
  });

  // Fails if a statement no detector registered is worded as something
  // else, or silently as nothing.
  it("throws for a kind no detector registered", () => {
    const phrasebook = phrasebookWith(createFindingsCatalog());
    expect(() => phrasebook.word({ kind: "unknown" }, "long")).toThrow(
      'No phrase is registered for "unknown"',
    );
  });

  // Fails if two detectors can register one kind with different phrases,
  // so which one words it would depend on their order; or if sharing one
  // phrase, as failed-requests and failed-deliveries share limit-refused's,
  // is refused.
  it("lets two detectors share a phrase for a kind, but not differ", () => {
    const project = sampleRecord.project;
    const same = [named, detectorWith({ named: NAMED })];
    expect(() => createPhrasebook({ project, detectors: same })).not.toThrow();
    const other = detectorWith({ named: { ...NAMED } });
    expect(() =>
      createPhrasebook({ project, detectors: [named, other] }),
    ).toThrow('Two different phrases are registered for "named"');
  });

  // Fails if the default detectors register one kind with two phrases, or
  // one of them collides with the verdict's.
  it("builds from the default detectors", () => {
    const detectors = createDetectors();
    const project = sampleRecord.project;
    expect(() => createPhrasebook({ project, detectors })).not.toThrow();
  });
});

describe("the default catalog's wording", () => {
  const entries = [...createFindingsCatalog().values()].flatMap((advice) =>
    Object.entries({
      ...advice.wording.reasons,
      ...advice.wording.limits,
    }).map(([id, words]) => ({ label: `${advice.type} ${id}`, id, words })),
  );

  // Fails if a type registers a reason or limit without both forms, or one
  // whose words, as #77 ships them, aren't its raw ID, which would change
  // the CLI report.
  it.each(entries)("words $label in both forms, as its raw ID", (e) => {
    expect(e.words).toEqual({ long: e.id, short: e.id });
  });

  // Fails if a type's reasons or limits are left out of the catalog.
  it("covers every type's reasons and limits", () => {
    expect(entries.map((e) => e.label)).toEqual([
      "api-gateway throttled",
      "api-gateway requestRate",
      "lambda throttled",
      "lambda concurrency",
      "rds too-many-connections",
      "rds connections",
      "rds queryWorkers",
      "sqs consumerConcurrency",
      "dynamodb throttled",
      "dynamodb readUnits",
      "dynamodb writeUnits",
    ]);
  });
});
