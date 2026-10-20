// Fixture for eager-imports.test.ts: an entry that reaches a package each
// way the check must tell apart. Only eager.ts, barrel/index.ts, and
// reexported.ts load at once; lazy.ts waits for `import()`, and
// types-only.ts lends only types.
import { barrelVersion } from "./barrel";
import { eagerVersion } from "./eager";
import type { TypesOnly } from "./types-only";
export { reexportedVersion } from "./reexported";

export const loadLazy = () => import("./lazy");
export const sample: TypesOnly = { version: eagerVersion };
export const sampleFromBarrel: TypesOnly = { version: barrelVersion };
