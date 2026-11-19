import { describe, expect, it } from "vitest";
import { createFindingsCatalog } from "../application/run-analysis/findings/catalog/create-findings-catalog";
import * as aws from "../domain/components/aws";
import { checkComponentContract } from "../domain/components/check-component-contract";
import type { ComponentDefinition } from "../domain/components/component-definition";
import type { ComponentType } from "../domain/components/component-registry";
import { SeededRandom } from "../domain/random/seeded-random";
import {
  defaultsRowsOf,
  ENTRY_PAGES,
  entriesPathOf,
  PROFILE_PAGES,
  profilePathOf,
} from "../adapters/templates/testing/fidelity-pages";
import { COMPONENT_ICONS } from "../ui/diagram/component-icons";
import definitionsGuide from "../../docs/architecture/component-definitions.md?raw";

// Every registered type has each piece of CONTRIBUTING's "Adding a
// component type" that no other test checks for it (#291): the component
// definitions guide's checklist says which test checks the rest.

const registered = aws.createAwsComponentRegistry().list();
const findings = createFindingsCatalog();

/** A definition `domain/components/aws` exports: any export but a function. */
type AwsDefinition = Exclude<
  (typeof aws)[keyof typeof aws],
  (...args: never[]) => unknown
>;

/**
 * Every definition `domain/components/aws` exports, whatever its name, with
 * its config type widened so the contract can take any of them.
 */
const exportedDefinitions = Object.values(aws)
  .filter((value): value is AwsDefinition => typeof value === "object")
  .map((definition) => definition as ComponentDefinition<unknown>);

/** The names of the limits a type declares, read from a fresh behavior. */
function limitNamesOf(type: ComponentType): string[] {
  const behavior = type.build(type.defaultConfig, {
    random: new SeededRandom(1),
  });
  return (behavior.limits ?? []).map((limit) => limit.name);
}

describe("every registered component type", () => {
  // Fails if a type is registered without its findings advice: remove
  // rds-advice from create-findings-catalog's list, or a reason or limit
  // from a type's wording (say, writeUnits from dynamo-db-advice).
  it.each(registered)(
    "$type has findings advice wording its reasons and limits",
    (type) => {
      const advice = findings.get(type.type);
      expect(advice, type.type).toBeDefined();
      for (const reason of type.rejectionReasons) {
        expect(advice?.wording.reasons, `${type.type} reason`).toHaveProperty([
          reason,
        ]);
      }
      for (const limit of limitNamesOf(type)) {
        expect(advice?.wording.limits, `${type.type} limit`).toHaveProperty([
          limit,
        ]);
      }
    },
  );

  // Fails if a type is registered without a canvas icon: remove sqs from
  // COMPONENT_ICONS.
  it.each(registered)("$type has a canvas icon", ({ type }) => {
    expect(Object.hasOwn(COMPONENT_ICONS, type), type).toBe(true);
  });

  // Fails if a type is registered without its folder in the fidelity
  // catalog: a profile whose defaults table has the type's rows (rename the
  // "RDS" rows in rds-profile.md's table), and a page of entries beside it
  // (rename rds-fidelity.md).
  it.each(registered)(
    "$type has a fidelity profile with its defaults, and a page of entries",
    ({ type, displayName }) => {
      const profile = PROFILE_PAGES[profilePathOf(type)] ?? "";
      const rows = defaultsRowsOf(profile).filter(
        ([component]) => component === `| ${displayName}`,
      );
      expect(rows.length, type).toBeGreaterThan(0);
      expect(ENTRY_PAGES[entriesPathOf(type)], type).toBeDefined();
    },
  );

  // Fails if a type is registered without a row in the component
  // definitions guide's table of types: remove the `sqs` row.
  it.each(registered)(
    "$type is listed in the component definitions guide",
    ({ type }) => {
      expect(definitionsGuide).toContain(`\n| \`${type}\` |`);
    },
  );

  // Fails if a type is registered but its definition isn't exported from
  // domain/components/aws, where this test finds it to run the contract:
  // drop `export { sqsDefinition }` from aws/index.ts.
  it("is exported from domain/components/aws", () => {
    expect(exportedDefinitions.map((d) => d.type).sort()).toEqual(
      registered.map((t) => t.type).sort(),
    );
  });

  // Fails if a registered type breaks ComponentDefinition's contract, even
  // if its own test file doesn't run checkComponentContract: make
  // sqsDefinition's rejectionReasons list "timeout".
  it.each(exportedDefinitions)(
    "$type passes the component contract",
    (definition) => {
      expect(checkComponentContract(definition).violations).toEqual([]);
    },
  );
});
