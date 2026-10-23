# Wind Tunnel

A workload simulator for exploring how your application's cloud architecture behaves under real-world usage. Wind Tunnel lets you replicate your application architecture and workflows to explore how it behaves under realistic stress. Easily detect failure points and explore mitigation options.

You model an application's architecture (for example API Gateway → Lambda → RDS), describe what its users do, and simulate concurrent load to see where bottlenecks form: throttling, exhausted connection pools, growing queues, and rising latency.

Wind Tunnel runs entirely in the browser. There is no backend, no server calls, and nothing to deploy. Projects are saved in your browser's storage and never leave your machine.

## Status

Early development. The MVP works: create a project from a template, view its architecture, run a workload, and watch the results, in the browser or headlessly. The [Roadmap](https://github.com/alanbickel/wind-tunnel/issues/32) has the current milestone and what's next.

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
| `npm run check:changed` | The same checks, limited to what changed since `main`: for use while you work (see [CONTRIBUTING](CONTRIBUTING.md#setup)) |
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
| [Findings](docs/design/findings.md) | What a run should tell you: hand-written readings of the template runs, the detectors that would write them, and the shape of a finding and the verdict |
| [User experience](docs/design/user-experience.md) | How reading a run and changing the architecture fit together: journeys, layout, the interaction model, and the data each step needs (in progress, #81) |
| [Fidelity](docs/design/fidelity.md) | Where Wind Tunnel differs from AWS, and which way each difference skews results |
| [AWS: Did you know?](docs/learning/aws-did-you-know.md) | AWS limits and at-scale behaviors the simulation models, with sources |
| [React: Mental model and pitfalls](docs/learning/react-mental-model.md) | React behaviors that surprise newcomers, why React works that way, and where each shows up here |
| [Contributing](CONTRIBUTING.md) | Setup, coding standards, tests, docs, milestones, and the branch, PR, and review workflow |

## License

[MIT](LICENSE)
