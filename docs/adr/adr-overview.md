# Architecture Decision Records

Each ADR records one significant decision: the context, what was decided, and its consequences. They explain *why* the code is the way it is. Skim the titles, and read an ADR in full when you touch the area it covers.

To write one, or to change a decision, follow [ADRs in the contributing guide](../../CONTRIBUTING.md#adrs). [ADR-0001](0001-record-architecture-decisions.md) explains the format.

| ADR | Decision |
|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions |
| [0002](0002-use-clean-architecture-layering.md) | Use Clean Architecture layering with an enforced dependency rule |
| [0003](0003-browser-only-react-typescript-app.md) | Build a browser-only app with TypeScript, React, and Vite |
| [0004](0004-persist-projects-in-indexeddb.md) | Persist projects in IndexedDB as versioned documents; ship templates as bundled data |
| [0005](0005-use-zod-for-schema-validation.md) | Use Zod for schema validation, including in the domain layer |
| [0006](0006-components-return-effects-to-the-engine.md) | Components return effects to the engine; they never schedule events |
| [0007](0007-metrics-observe-the-engine.md) | Metrics observe the engine through events and ticks; components expose named gauges and counters |
| [0008](0008-ports-exchange-project-records.md) | Ports exchange project records (domain project plus timestamps, source, and layout), not documents |
| [0009](0009-collaborators-come-from-factories.md) | Classes take their collaborators through the constructor, typed as interfaces; factories and composition roots build them |
| [0010](0010-draw-diagrams-with-react-flow-behind-our-own-component.md) | Draw architecture diagrams with React Flow, imported only by `src/ui/diagram/`, which exposes our own `Diagram` component |
| [0011](0011-draw-charts-with-recharts-behind-our-own-components.md) | Draw metric charts with Recharts, imported only by `src/ui/charts/`, which exposes our own chart components |
| [0012](0012-style-the-ui-with-css-tokens-and-css-modules.md) | Style the UI with design tokens as CSS custom properties (both themes in one file, via `light-dark()`) and CSS Modules; tokens and styles live only in `src/ui/` |
| [0013](0013-derive-run-results-in-application-run-analysis.md) | Derive what a run means (totals, per-second counts, later findings) in `src/application/run-analysis/`, shared by the UI and the CLI |
| [0014](0014-components-report-their-limits.md) | Components report their limits, and metrics report each limit's use against it; a rate limit's use is how far its token bucket was drawn down, with its flow alongside |
