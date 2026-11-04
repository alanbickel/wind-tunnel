# Tests

- Unit tests sit next to the code (`foo.ts` → `foo.test.ts`) and run in Node. Architecture tests live in `tests/architecture/`. A test that needs adapters and the UI together, which may not import each other, lives in `src/integration/`: the run panel's findings for real template runs, for example.
- **UI tests** start with `// @vitest-environment jsdom`, render with [Testing Library](https://testing-library.com/docs/react-testing-library/intro/), and call `cleanup` in `afterEach`. Give components use cases through `UseCasesProvider`: `fakeUseCases()` rejects every call you don't override, and `inMemoryUseCases()` runs the real project use cases over in-memory adapters (both in `src/ui/app/testing/`).
- **Use jsdom only for a test that needs the browser:** one that renders, or reads `document`, `window`, or `localStorage`. jsdom adds 3 to 5 s of startup to each file in a full run. Everything else runs in Node, where the setup file skips loading Testing Library.
- **Run whole templates in `beforeAll`,** with `RUN_TIMEOUT_MS` from `src/adapters/templates/testing/run-template.ts`, not in a `describe` body. Vitest starts the files that took longest last time first, but it counts only test and hook time, so a file that does its work while collecting looks fast and starts last. A file's runs are serial, so the slowest file sets how long a full run takes. Split a file that runs many templates, as `scenarios/` does by workload.
- The coding standards apply to tests too. ESLint skips the length and parameter checks there, because a `describe` block groups many tests; keep each test itself within the rule of 30, and split a long scenario into named steps.
- Tests should be able to fail. When you write or change one, break the code it covers and watch it go red at least once. Then say how you broke it in a comment above the test, so a reviewer can check it without rerunning it and a later reader knows what the test guards:
  ```ts
  // Fails if the queue drops messages that are still in flight when the run ends.
  it("counts in-flight messages in the totals", () => {
  ```
  Write one comment per `it` or `it.each`. For a change to a shared suite (`checkComponentContract` and the other contract checkers), put it on the check you changed. A regression test's comment names the bug it guards against: the change that turns it red is the bug coming back.
- Use the seed, not luck. Anything random runs from a fixed seed. Scenario tests that assert a template's lesson check several seeds (`src/adapters/templates/scenarios/`) with loose thresholds, so they pin the lesson rather than one run's numbers.
- **Contract suites** check that an implementation keeps the promises of its interface. Every component type must pass `checkComponentContract`, every `ProjectRepository` adapter must pass `checkProjectRepositoryContract`, and every `SimulationRunner` must pass `checkSimulationRunnerContract`, each with an empty list of violations.
- **Outputs must reconcile.** Totals in metrics and reports add up: started = succeeded + failed + in progress, and so on. Show work that's still in progress rather than dropping it, and test the remainders (see `src/adapters/cli/report-reconciles.test.ts`). Add a check when you add a column or a counter. To find a workflow or component in a snapshot, use `workflowIn` and `componentIn` (`src/domain/metrics/testing/`) instead of chains of `?.`.
- Latencies carry floating-point drift (`49.000000000000014`): compare them with `toBeCloseTo`. Percentiles are bucket upper bounds, up to 5% high ([metrics guide](../architecture/metrics.md)).
- Model changes come with before/after numbers from `npm run simulate` in the PR description.

## Docs backed by tests

Some docs quote output that a test generates or checks. Change them together:

| Doc | Test |
|---|---|
| Excerpts in the [engine](../architecture/simulation-engine.md), [component](../architecture/component-definitions.md), [domain model](../architecture/domain-model.md), and [metrics](../architecture/metrics.md) guides | Snapshot traces in `src/domain/traces/`, one test file per guide; refresh with `npx vitest run src/domain/traces --update`, then update the excerpt in the guide |
| The sample reports in the [headless runner guide](../architecture/headless-runner.md) and the [findings guide](../architecture/finding-detectors.md) | Snapshots in `src/adapters/cli/reports/`; refresh with `npx vitest run src/adapters/cli --update` and read the diff |
| The verdict quoted under each reading in [findings.md §1](../design/findings.md#1-hand-written-readings) | `describeFindings` in `src/adapters/templates/findings/`, which compares the CLI's verdict for each run with the doc's quote; change the doc to match what the code prints |
| The worked example of a finding's long and short forms in the [findings guide](../architecture/finding-detectors.md#how-a-finding-is-worded) | Each run's verdict and findings in `src/adapters/cli/reports/findings/`, long (`<run>.txt`) and short (`<run>.short.txt`), which `describeFindings` pins; refresh with `npx vitest run src/adapters/templates/findings --update` and read every changed line |
| The outlines in the [workflow editor guide](../architecture/workflow-editor.md#worked-example) | [`workflow-outlines.txt`](../../src/adapters/templates/details/workflow-outlines.txt), each template's workflows as Details outlines them; refresh with `npx vitest run src/adapters/templates/details --update`, then update the excerpts in the guide |
| Excerpts in the [user interface guide](../architecture/user-interface.md) | The snapshot trace in `src/ui/traces/`; refresh with `npx vitest run src/ui/traces --update`, then update the excerpts in the guide |
| Each template's lesson in [MVP design §7](../design/mvp-design.md) | The scenario tests in `src/adapters/templates/scenarios/` |

## Gotchas

- **Put the path before `--update`.** Vitest's `-u` takes an optional value, so `npx vitest run -u <path>` treats the path as that value, runs the whole suite, and rewrites every snapshot. Write `npx vitest run <path> --update`.
- **Slow full runs.** In a full local run, a slow test such as `layer-rules`, which runs ESLint, can time out while everything else runs in parallel; it passes alone. The run's chart test (now in `OpenedProject.test.tsx`) used to as well, but it hasn't since [#45](https://github.com/alanbickel/wind-tunnel/pull/45) made the charts lazy-load ([#27](https://github.com/alanbickel/wind-tunnel/issues/27), closed). If it times out again, open a new issue rather than reopening #27.
- **CSS in tests is empty.** Vitest turns every CSS import into an empty string, `?raw` included, unless the file matches `test.css.include` in `vite.config.ts`. The contrast test reads `tokens.css` that way; a test that needs another stylesheet's text adds it there.
- **Measuring the test suite.** The percentages in Vitest's summary are shares of time summed across workers, not of the wall time. For a breakdown by file, write a throwaway reporter whose `onTestRunEnd` prints each module's `diagnostic()`, which gives its environment, setup, collect, and test times. Leave `isolate` on, even though Vitest suggests turning it off: files would share module state, and `Diagram`'s loading test fails whenever another file in the same worker has already loaded React Flow.
