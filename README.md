# Wind Tunnel

A workload simulator for exploring how application workflows behave under real-world stress. Wind Tunnel lets you replicate your application architecture and workflows to explore how it behaves under realistic stress. Easily detect failure points and explore mitigation options.

You model an application's architecture (for example API Gateway → Lambda → RDS), describe what its users do, and simulate concurrent load to see where bottlenecks form: throttling, exhausted connection pools, growing queues, and rising latency.

Wind Tunnel runs entirely in the browser. There is no backend, no server calls, and nothing to deploy. Projects are saved in your browser's storage and never leave your machine.

## Status

Early development. The simulation engine, metrics, persistence, and a headless runner work; the browser UI is next. See the [implementation plan](docs/implementation-plan.md) for the current milestone.

## Running it

Requires Node.js 24 (see [`.nvmrc`](.nvmrc)).

```sh
npm install
npm run dev        # start the dev server
npm run check      # typecheck, lint, format check, tests, and build (what CI runs)
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run test` / `npm run test:watch` | Run the Vitest tests once / in watch mode |
| `npm run lint` | ESLint, including the architecture layer rules and the coding standards |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | TypeScript checks for all projects (`tsc -b`) |
| `npm run simulate -- --template template-a` | Run a template headlessly and print a text report |

## Documentation

This is the map of every document. New to the code? Start with [Getting started](docs/getting-started.md).

| Document | What it's for |
|---|---|
| [Getting started](docs/getting-started.md) | From a fresh clone to your first change: what to read, in what order |
| [Glossary](docs/glossary.md) | Every domain term, with the type that holds it |
| [Architecture overview](docs/architecture/architecture-overview.md) | Layers, where code goes, how the rules are enforced, and the guide to each subsystem |
| [Decisions (ADRs)](docs/adr/adr-overview.md) | Why things are the way they are, one decision per record |
| [MVP design](docs/design/mvp-design.md) | The detailed reference: domain model, engine, document format, templates, and testing strategy |
| [Fidelity](docs/design/fidelity.md) | Where Wind Tunnel differs from AWS, and which way each difference skews results |
| [Implementation plan](docs/implementation-plan.md) | The current milestone, what's next, and a progress log |
| [AWS: Did you know?](docs/learning/aws-did-you-know.md) | AWS limits and at-scale behaviors the simulation models, with sources |
| [Contributing](CONTRIBUTING.md) | Setup, coding standards, tests, docs, and the branch, PR, and review workflow |

## License

[MIT](LICENSE)
