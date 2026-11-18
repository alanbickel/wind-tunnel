// The components that `React.lazy` loads, loaded before a jsdom test file
// starts. A file in the shared project can end while one is still loading,
// and the import then fails in the next file to run in that worker, which
// has nothing to do with it. Loaded here, `React.lazy` finds each one in the
// module cache. A test that watches a chunk load runs isolated, without this.
if ("document" in globalThis) {
  await Promise.all([
    import("../../diagram/DiagramCanvas"),
    import("../../charts/ChartPlot"),
    import("../../charts/ProfilePlot"),
  ]);
}
