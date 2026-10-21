// Only jsdom tests use Testing Library. Importing it costs every Node test
// file most of a second in a full parallel run, so they skip it.
if ("document" in globalThis) {
  const { configure } = await import("@testing-library/dom");

  // `findBy*` and `waitFor` give up after 1 s by default. A full parallel run
  // can starve a jsdom test for longer than that, failing it at random. They
  // poll, so a passing test still returns as soon as its element appears.
  configure({ asyncUtilTimeout: 4_000 });
}
