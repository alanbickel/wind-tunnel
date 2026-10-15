// Checks that the ESLint layer rules in eslint.config.js actually fire.
// Without this, a typo in a regex could silently switch a rule off.
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const LAYER_RULES = new Set([
  "@typescript-eslint/no-restricted-imports",
  "no-restricted-properties",
  "no-restricted-syntax",
]);

// The snippets below are linted under made-up paths that no tsconfig includes.
// The layer rules don't need type information, so typed parsing is turned off.
const eslint = new ESLint({
  ruleFilter: ({ ruleId }) => LAYER_RULES.has(ruleId),
  overrideConfig: {
    languageOptions: { parserOptions: { projectService: false } },
  },
});

/** Lints `code` as if it lived at `filePath` and returns the layer-rule violations. */
async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe("layer rules", () => {
  // Regression: the first lint loads the config and plugins, which can take
  // over 5 s in a busy parallel run. Pay that once here, with its own budget,
  // instead of timing out whichever test runs first.
  beforeAll(async () => {
    await eslint.lintText("", { filePath: "src/domain/warm-up.ts" });
  }, 60_000);

  describe.each([
    ["src/domain/x.ts", "../application/x"],
    ["src/domain/x.ts", "../adapters/x"],
    ["src/domain/sub/x.ts", "../../ui/x"],
    ["src/domain/x.ts", "../main"],
    ["src/domain/x.ts", "react"],
    ["src/domain/x.ts", "node:fs"],
    ["src/domain/x.ts", "vitest"],
    ["src/application/x.ts", "../adapters/x"],
    ["src/application/x.ts", "../ui/x"],
    ["src/application/x.ts", "zod"],
    ["src/adapters/x.ts", "../ui/x"],
    ["src/ui/x.ts", "../adapters/x"],
    ["src/ui/x.ts", "../domain/x"],
  ])("in %s", (filePath, specifier) => {
    it(`rejects import from "${specifier}"`, async () => {
      expect(
        await violations(
          filePath,
          `import { x } from "${specifier}";\nvoid x;\n`,
        ),
      ).toEqual(["@typescript-eslint/no-restricted-imports"]);
    });
  });

  describe.each([
    ["src/domain/x.ts", `import { z } from "zod";`],
    ["src/domain/x.ts", `import { y } from "./sub/y";`],
    ["src/domain/x.test.ts", `import { it } from "vitest";`],
    ["src/application/x.ts", `import { y } from "../domain/y";`],
    ["src/application/x.test.ts", `import { it } from "vitest";`],
    ["src/adapters/x.ts", `import { y } from "../application/y";`],
    ["src/adapters/x.ts", `import { y } from "../domain/y";`],
    ["src/adapters/x.ts", `import { z } from "zod";`],
    ["src/ui/x.ts", `import { y } from "../application/y";`],
    ["src/ui/x.ts", `import type { Y } from "../domain/y";`],
    ["src/ui/x.ts", `import { useState } from "react";`],
    ["src/main.tsx", `import { y } from "./adapters/y";`],
  ])("in %s", (filePath, importLine) => {
    it(`allows ${importLine}`, async () => {
      expect(await violations(filePath, `${importLine}\n`)).toEqual([]);
    });
  });

  describe.each(["src/domain/x.ts", "src/application/x.ts"])(
    "in %s",
    (filePath) => {
      it.each([
        ["Math.random()", "no-restricted-properties"],
        ["Date.now()", "no-restricted-properties"],
        ["new Date()", "no-restricted-syntax"],
        ["Date()", "no-restricted-syntax"],
      ])("rejects %s", async (expression, rule) => {
        expect(
          await violations(filePath, `export const v = ${expression};\n`),
        ).toEqual([rule]);
      });
    },
  );

  it("allows Math.random() outside the core layers", async () => {
    expect(
      await violations(
        "src/adapters/x.ts",
        "export const v = Math.random();\n",
      ),
    ).toEqual([]);
  });
});
