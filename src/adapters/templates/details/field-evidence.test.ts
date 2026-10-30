import { describe, expect, it } from "vitest";
import { createFieldCatalog } from "../../../application/details/create-field-catalog";
import type {
  ConfigFieldDescriptor,
  FieldDescriptor,
} from "../../../application/details/field-descriptor";
import { EDGE_FIELDS } from "../../../application/details/fields/edge-fields";
import { createAwsComponentRegistry } from "../../../domain/components/aws";
import fidelityDoc from "../../../../docs/design/fidelity.md?raw";

// The Details tab's help is right about AWS (#85): every setting has a
// descriptor, every fidelity entry a descriptor cites exists, and every
// default's evidence is what fidelity's defaults table says.

const registry = createAwsComponentRegistry();
const catalog = createFieldCatalog();

/** A caller type and one of its edge settings. */
interface EdgeRowInput {
  readonly displayName: string;
  readonly key: string;
}

/**
 * The edge row for a caller type's setting: its own, or else the one for
 * every type, or else the one for the other types.
 */
function edgeRow(
  rows: ReadonlyMap<string, DefaultRow>,
  { displayName, key }: EdgeRowInput,
): DefaultRow | undefined {
  return [displayName, "every type", "the other types"]
    .map((who) => rows.get(`Edges from ${who} ${key}`))
    .find((row) => row !== undefined);
}

/** Each component setting's descriptor, labeled "type key". */
const configFields = [...catalog.values()].flatMap(({ type, fields }) =>
  fields.map((field) => ({ label: `${type} ${field.key}`, type, field })),
);

/** Every descriptor, the edges' included. */
const allFields: readonly FieldDescriptor[] = [
  ...configFields.map(({ field }) => field),
  ...EDGE_FIELDS,
];

/** The IDs of fidelity.md's entries, from headings like `#### RDS-2: …`. */
const FIDELITY_IDS = new Set(
  [...fidelityDoc.matchAll(/^#### ([A-Z]+-\d+):/gm)].map((m) => m[1]),
);

/** A fidelity ID, wherever it's cited, e.g. "RDS-2". */
const FIDELITY_ID = /\b[A-Z]+-\d+\b/g;

/** One setting's row of fidelity's defaults table. */
interface DefaultRow {
  readonly level: string;
  readonly fidelityIds: readonly string[];
}

/** The defaults table's rows, keyed "Component key", e.g. "RDS queryWorkers". */
function defaultRows(): ReadonlyMap<string, DefaultRow> {
  const section = fidelityDoc.split("## Default values and their evidence")[1];
  const table = (section ?? "").split("\n## ")[0] ?? "";
  const rows = table
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Component"))
    .map((line) => line.split(" | "));
  return new Map(
    rows.flatMap(([component = "", settings = "", , evidence = ""]) =>
      [...settings.matchAll(/`(\w+)`/g)].map((m) => [
        `${component.slice(2)} ${m[1] ?? ""}`,
        {
          level: (evidence.split(/[\s:;(]/)[0] ?? "").toLowerCase(),
          fidelityIds: evidence.match(FIDELITY_ID) ?? [],
        },
      ]),
    ),
  );
}

describe("the setting descriptors", () => {
  // Fails if a type's defaultConfig gains a setting with no descriptor, or
  // a descriptor names a setting the type doesn't have (say, after a
  // rename), or a registered type has no descriptors at all.
  it("describe every setting of every registered type, and nothing else", () => {
    for (const type of registry.list()) {
      const keys = Object.keys(type.defaultConfig as object);
      const described = catalog.get(type.type)?.fields.map((f) => f.key);
      expect(described, type.type).toEqual(keys);
    }
    expect([...catalog.keys()].sort()).toEqual(
      registry
        .list()
        .map((t) => t.type)
        .sort(),
    );
  });

  // Fails if a descriptor's help or evidence cites a fidelity entry that
  // fidelity.md doesn't have, as after an entry is renumbered or deleted.
  it("cite only fidelity entries that exist", () => {
    expect(FIDELITY_IDS.size).toBeGreaterThan(30);
    const cited = [
      ...allFields.flatMap((field) => field.help.match(FIDELITY_ID) ?? []),
      ...configFields.flatMap(({ field }) => citedBy(field)),
    ];
    expect(cited.length).toBeGreaterThan(10);
    for (const id of cited) {
      expect(FIDELITY_IDS.has(id), id).toBe(true);
    }
  });

  // Fails if a descriptor's evidence level or entry differs from fidelity's
  // defaults table, or a setting has no row there: the help would claim
  // more, or less, than the catalog of differences backs.
  it("give each default the evidence fidelity's defaults table gives it", () => {
    const rows = defaultRows();
    for (const { label, type, field } of configFields) {
      const displayName = registry.get(type)?.displayName ?? type;
      const row = rows.get(`${displayName} ${field.key}`);
      expect(row, label).toBeDefined();
      expect(field.evidence.level, label).toBe(row?.level);
      const { fidelityId } = field.evidence;
      if (fidelityId === undefined) {
        expect(row?.fidelityIds, label).toEqual([]);
      } else {
        expect(row?.fidelityIds, label).toContain(fidelityId);
      }
    }
  });

  // Fails if a type's edgeEvidence differs from fidelity's edge rows, or
  // has none for a setting: e.g. API Gateway's timeout called an
  // assumption, or Lambda's called documented.
  it("give each type's edge defaults the evidence fidelity's edge rows give them", () => {
    const rows = defaultRows();
    for (const { type, displayName } of registry.list()) {
      const evidence = catalog.get(type)?.edgeEvidence;
      expect(evidence, type).toBeDefined();
      for (const { key } of EDGE_FIELDS) {
        const label = `${type} edge ${key}`;
        const row = edgeRow(rows, { displayName, key });
        expect(row, label).toBeDefined();
        expect(evidence?.[key].level, label).toBe(row?.level);
        expect(row?.fidelityIds, label).toContain(evidence?.[key].fidelityId);
      }
    }
  });

  // Fails if a setting's help is left empty, or its label is its key.
  it("give every setting a label and help of its own", () => {
    for (const field of allFields) {
      expect(field.label, field.key).not.toBe(field.key);
      expect(field.help.length, field.key).toBeGreaterThan(20);
    }
  });
});

/** The entry a descriptor's evidence cites, if any. */
function citedBy(field: ConfigFieldDescriptor): string[] {
  const id = field.evidence.fidelityId;
  return id === undefined ? [] : [id];
}
