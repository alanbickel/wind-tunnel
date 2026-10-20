// Fixture for eager-imports.test.ts: an import the walk can't follow,
// because it names no file.
// @ts-expect-error -- the missing file is the point of the fixture.
export { missing } from "./missing";
