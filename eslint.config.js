// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------
// Layer rules (ADR-0002, ADR-0005)
//
// Imports point inward only: ui/adapters -> application -> domain.
// Each layer gets a `no-restricted-imports` config built from these helpers.
// Matching is done on the import specifier, so `../adapters/foo` and
// `../../ui` are caught no matter how deep the importing file is.
// ---------------------------------------------------------------------------

/** Matches an import that goes through a folder named after one of the layers. */
const layerPattern = (/** @type {string[]} */ layers) =>
  `(^|/)(${layers.join("|")})(/|$)`;

/** Matches the composition root, which nothing may import. */
const MAIN = {
  regex: "(^|/)main(\\.tsx?)?$",
  message: "Only the browser loads src/main.tsx.",
};

/**
 * Matches any package import except those listed. `domain` and `application`
 * may only use pure libraries approved by an ADR (ADR-0005).
 */
const packagesExcept = (
  /** @type {string[]} */ allowed,
  /** @type {string} */ message,
) => ({
  regex: `^(?!${["\\.", ...allowed.flatMap((name) => [`${name}$`, `${name}/`])].join("|")})`,
  message,
});

/** Pure libraries approved for `domain` (ADR-0005 lists the rule for adding more). */
const DOMAIN_PACKAGES = ["zod"];
/** Pure libraries approved for `application`. None yet. */
const APPLICATION_PACKAGES = /** @type {string[]} */ ([]);
/** Extra packages core test files may import. */
const TEST_PACKAGES = ["vitest"];

const domainImports = (/** @type {string[]} */ extraPackages) => ({
  patterns: [
    {
      regex: layerPattern(["application", "adapters", "ui"]),
      message: "domain/ must not import from outer layers (ADR-0002).",
    },
    MAIN,
    packagesExcept(
      [...DOMAIN_PACKAGES, ...extraPackages],
      "domain/ may only import approved pure libraries (ADR-0005).",
    ),
  ],
});

const applicationImports = (/** @type {string[]} */ extraPackages) => ({
  patterns: [
    {
      regex: layerPattern(["adapters", "ui"]),
      message: "application/ may only import from domain/ (ADR-0002).",
    },
    MAIN,
    packagesExcept(
      [...APPLICATION_PACKAGES, ...extraPackages],
      "application/ may only import approved pure libraries (ADR-0005).",
    ),
  ],
});

const adaptersImports = {
  patterns: [
    {
      regex: layerPattern(["ui"]),
      message: "adapters/ must not import from ui/ (ADR-0002).",
    },
    MAIN,
  ],
};

const uiImports = {
  patterns: [
    {
      regex: layerPattern(["adapters"]),
      message:
        "ui/ gets adapters through dependency injection, not imports (ADR-0002).",
    },
    {
      regex: layerPattern(["domain"]),
      allowTypeImports: true,
      message:
        "ui/ may import only types from domain/; use `import type` (ADR-0002).",
    },
    MAIN,
  ],
};

// `domain` and `application` must be deterministic (ADR-0002). Time and
// randomness come in through ports / RandomSource. DOM, Worker, and Node APIs
// are already rejected by tsconfig.core.json.
const nondeterminismBans = {
  "no-restricted-properties": [
    "error",
    {
      object: "Math",
      property: "random",
      message: "Use the RandomSource passed in instead.",
    },
    { object: "Date", property: "now", message: "Use the Clock port instead." },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "NewExpression[callee.name='Date']",
      message: "Use the Clock port instead.",
    },
    {
      selector: "CallExpression[callee.name='Date']",
      message: "Use the Clock port instead.",
    },
  ],
};

const TEST_FILES = "**/*.test.{ts,tsx}";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),

  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: { globals: globals.browser },
  },

  // Layer boundaries. Later blocks replace earlier options for the same rule,
  // so test files get their own block with vitest added to the allowlist.
  {
    files: ["src/domain/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", domainImports([])],
    },
  },
  {
    files: [`src/domain/${TEST_FILES}`],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        domainImports(TEST_PACKAGES),
      ],
    },
  },
  {
    files: ["src/application/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        applicationImports([]),
      ],
    },
  },
  {
    files: [`src/application/${TEST_FILES}`],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        applicationImports(TEST_PACKAGES),
      ],
    },
  },
  {
    files: ["src/adapters/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", adaptersImports],
    },
  },
  {
    files: ["src/ui/**"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", uiImports] },
  },
  {
    files: ["src/domain/**", "src/application/**"],
    rules: nondeterminismBans,
  },

  // Must be last: turns off rules that conflict with Prettier's formatting.
  prettier,
]);
