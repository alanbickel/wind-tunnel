# Wind Tunnel Architecture Overview

> **Status: draft.** The project scaffolding and layer folders exist, but the layers are still empty. This describes the intended structure and will be updated as the code is written. Decisions behind it are recorded in [`docs/adr/`](../adr/).

Start here if you're new to the codebase.

## What Wind Tunnel does

Wind Tunnel lets you model a cloud application's architecture (e.g. API Gateway → Lambda → DynamoDB), describe what users do with it, and simulate concurrent load to see where bottlenecks form.

## Core concepts

The vocabulary below is used throughout the code and docs.

| Term | Meaning | Example |
|---|---|---|
| **Component** | One cloud service instance in the model, with capacity behavior | A Lambda function, a DynamoDB table |
| **Edge** | A connection between two components, with latency, timeout, and retry policy | Lambda → DynamoDB |
| **Architecture** | The graph of components and edges | The whole diagram |
| **Workflow** | A named, ordered list of steps a request takes through the architecture | "Checkout": API GW → OrderFn → DynamoDB write ×2 → SQS publish |
| **Workload** | Which workflows run, in what mix, at what rate over time | 80% browse / 20% checkout, ramping 100 → 5,000 users |
| **Run** | One execution of a workload against an architecture, producing metrics | p99 latency, throttles, queue depth over time |

```mermaid
flowchart LR
    W[Workload] -->|"generates requests for"| WF[Workflows]
    WF -->|"traverse"| A[Architecture]
    A -->|"made of"| C[Components]
    A -->|"made of"| E[Edges]
    W & A --> R[Run]
    R -->|"produces"| M[Metrics]
```

## Layers and the dependency rule

The code follows Clean Architecture ([ADR-0002](../adr/0002-use-clean-architecture-layering.md)). **Imports may only point inward.** Tooling enforces this in CI.

```mermaid
flowchart TB
    subgraph outer["Outer layers (change often)"]
        UI["ui/<br/>React components & hooks"]
        AD["adapters/<br/>Worker bridge, storage,<br/>serialization, IaC import/export"]
    end
    subgraph app["application/"]
        UC["Use cases<br/>RunSimulation, CompareRuns, ..."]
        P["Ports (interfaces)<br/>Clock, ProjectRepository,<br/>SimulationRunner, ..."]
    end
    subgraph dom["domain/ (most stable)"]
        D["Entities & simulation engine<br/>Architecture, Component, Workflow,<br/>Workload, behavior primitives,<br/>RandomSource"]
    end

    UI --> UC
    AD -.->|implements| P
    UC --> P
    UC --> D
    AD --> D
    MAIN["main.tsx<br/>composition root"] --> UI
    MAIN --> AD
```

## Where does my code go?

| If you're writing… | Put it in | Notes |
|---|---|---|
| A new cloud service type (e.g. Kinesis) | `src/domain/components/` | Register it; don't edit the engine. Must pass the component contract tests. |
| A new capacity behavior (e.g. token bucket variant) | `src/domain/behaviors/` | Keep it small and composable. |
| A new user action (e.g. "duplicate architecture") | `src/application/use-cases/` | Depend on ports, not concrete adapters. |
| Something that needs time, storage, or a Worker | Define a port in `src/application/ports/`, implement it in `src/adapters/` | Never call `Date.now` in `domain`/`application`. |
| Something that needs randomness | Use the `RandomSource` passed in from `src/domain/random/` | Never call `Math.random`; runs must stay reproducible from a seed. |
| A CloudFormation/CDK/Terraform importer or exporter | `src/adapters/iac/` | Converts between file formats and domain objects. |
| A React component | `src/ui/` | Ordinary React patterns are fine here. Get use cases via context, not by importing adapters. |
| Wiring adapters to ports | `src/main.tsx` | The only place that knows about every layer. |

## How the rules are enforced

The layer rules are checked by tooling, so a mistake fails `npm run check` (and CI) instead of waiting for code review.

| Rule | Enforced by | Where |
|---|---|---|
| Imports point inward only; `ui` imports only *types* from `domain`; nothing imports `main.tsx` | `@typescript-eslint/no-restricted-imports`, configured per layer | [`eslint.config.js`](../../eslint.config.js) |
| `domain` and `application` use only approved pure libraries (currently `zod` in `domain`, [ADR-0005](../adr/0005-use-zod-for-schema-validation.md)); tests there may also import `vitest` | Same rule, with an allowlist of packages | [`eslint.config.js`](../../eslint.config.js) |
| No DOM, `Worker`, timers, or Node APIs in `domain` and `application` | TypeScript: these folders are checked without the DOM lib or Node types | [`tsconfig.core.json`](../../tsconfig.core.json) |
| No `Math.random`, `Date.now`, `new Date()`, or `Date()` in `domain` and `application` | `no-restricted-properties` and `no-restricted-syntax` | [`eslint.config.js`](../../eslint.config.js) |

[`tests/architecture/layer-rules.test.ts`](../../tests/architecture/layer-rules.test.ts) lints sample snippets in each layer and asserts that the rules above fire. If you change the rules, update that test.

To approve a new library for `domain` or `application`, write an ADR, then add it to `DOMAIN_PACKAGES` or `APPLICATION_PACKAGES` in `eslint.config.js`.

### TypeScript projects

`npm run typecheck` runs `tsc -b`, which checks three projects listed in [`tsconfig.json`](../../tsconfig.json). All of them extend `tsconfig.base.json` (strict mode, `noUncheckedIndexedAccess`, `noImplicitOverride`).

| Project | Covers | Environment |
|---|---|---|
| `tsconfig.core.json` | `src/domain`, `src/application` | ECMAScript only |
| `tsconfig.app.json` | all of `src` | Browser (DOM) + Vite, JSX |
| `tsconfig.node.json` | `vite.config.ts`, `tests/` | Node |

`domain` and `application` are checked twice: once in the core project to keep browser APIs out, and once in the app project, where the rest of `src` imports them.

## Tooling

| Tool | Used for |
|---|---|
| [Vite](https://vite.dev/) | Dev server and production build |
| [Vitest](https://vitest.dev/) | Tests. Unit tests sit next to the code (`*.test.ts`); cross-cutting tests live in `tests/` |
| [ESLint](https://eslint.org/) (flat config) + [typescript-eslint](https://typescript-eslint.io/) | Linting, with the `strictTypeChecked` rules, React hooks rules, and the layer rules above |
| [Prettier](https://prettier.io/) | Code formatting. Markdown is excluded so docs stay hand-formatted. |
| GitHub Actions | CI runs `npm run check` on every push to `main` and on pull requests ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) |

## Planned: how a simulation run works

```mermaid
sequenceDiagram
    actor User
    participant UI as ui/
    participant UC as RunSimulation (application)
    participant WB as WorkerSimulationRunner (adapter)
    participant W as Web Worker
    participant E as Engine (domain)

    User->>UI: Click "Run"
    UI->>UC: execute(architecture, workload, seed)
    UC->>WB: start(...) via SimulationRunner port
    WB->>W: postMessage(serialized inputs)
    W->>E: run with seeded RandomSource
    loop every snapshot tick
        E-->>W: metrics snapshot
        W-->>WB: postMessage(snapshot)
        WB-->>UI: snapshot via subscription
    end
    E-->>W: final results
    W-->>WB: done
    WB-->>UI: run complete
```

## Keeping these docs current

- Update this overview **in the same pull request** as any change that alters the structure it describes.
- Significant decisions get an ADR (see [ADR-0001](../adr/0001-record-architecture-decisions.md)).
- Diagrams are written in [Mermaid](https://mermaid.js.org/) so they live next to the code, show up in diffs, and render on GitHub. In VS Code, the "Markdown Preview Mermaid Support" extension renders them in preview.
