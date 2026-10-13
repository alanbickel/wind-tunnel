# ADR-0002: Use Clean Architecture layering with an enforced dependency rule

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Wind Tunnel has a few distinct concerns that change at different rates and for different reasons:

- **The simulation model**: components, queues, rate limits, workflows, workloads. It should be pure, deterministic, and testable without a browser.
- **Use cases**: building an architecture, defining workflows, running and comparing simulations.
- **Delivery mechanisms**: the React UI, a Web Worker to run the simulation off the main thread, browser storage, and later importers/exporters for real cloud configuration (CloudFormation, CDK, Terraform).

We expect the delivery mechanisms to change and multiply over time (new UIs, new importers, possibly a headless CLI), while the simulation model should be stable and trusted. If the model depends on React or on a file format, every UI or format change risks breaking the simulation.

## Decision

Organize source code into concentric layers. **Source dependencies point inward only.**

| Layer | Folder | Contains | May import from |
|---|---|---|---|
| Domain | `src/domain/` | Entities and value objects (Architecture, Component, Edge, Workflow, Workload), behavior primitives (queue, concurrency limit, rate limiter, cache), simulation engine core | nothing outside `domain` |
| Application | `src/application/` | Use cases (e.g. `RunSimulation`, `CompareRuns`) and **port** interfaces they need (`Clock`, `ProjectRepository`, `SimulationRunner`, …) | `domain` |
| Adapters | `src/adapters/` | Implementations of ports: Web Worker bridge, persistence, JSON serialization, IaC import/export, presenters/view models | `application`, `domain` |
| UI | `src/ui/` | React components and hooks | `application`, `domain` (types only) |
| Composition root | `src/main.tsx` | Wires adapters to ports and starts the app | anything |

Rules:

1. `domain` and `application` contain **no framework or browser APIs** (no React, no DOM, no `window`, no `Worker`, no `Math.random`, no `Date.now`). Wall-clock time goes through the `Clock` port. Randomness goes through a seeded `RandomSource` defined in `domain` (the engine needs it, and `domain` cannot import from `application`).
2. `ui` does not import from `adapters`. It receives use cases through dependency injection (React context) set up in the composition root.
3. The dependency rule is **enforced by tooling** (e.g. `dependency-cruiser` or `eslint-plugin-boundaries`) and checked in CI, so it doesn't rely on reviewers remembering it.

We apply SOLID principles within this structure, most visibly:

- **Open/Closed:** new component types (e.g. Kinesis, ElastiCache) are added by registering a new component definition, not by editing the engine.
- **Interface Segregation:** component behavior is composed from small capabilities (`Queueing`, `ConcurrencyLimited`, `RateLimited`, `Caching`) rather than one large interface.
- **Liskov Substitution:** every component definition must pass a shared contract test suite.
- **Dependency Inversion:** use cases depend on ports; adapters implement them.

## Consequences

- The simulation engine can run headless in Node for unit tests, benchmarks, and a possible future CLI.
- Importers for CloudFormation/CDK/Terraform become adapters that produce domain objects; they don't need engine changes.
- There is more boilerplate (ports, adapters, wiring) than a typical React app. To keep that cost reasonable, we apply the layering **strictly** to `domain` and `application`, and **pragmatically** in `ui`: ordinary React patterns are fine inside the UI layer.
- Contributors need to learn where code belongs. [`docs/architecture/README.md`](../architecture/README.md) contains a "where does my code go?" guide.
