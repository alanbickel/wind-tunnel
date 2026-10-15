# Wind Tunnel

A workload simulator for exploring how application workflows behave under real-world stress. Wind Tunnel lets you replicate your application architecture and workflows to explore how it behaves under realistic stress. Easily detect failure points and explore mitigation options.

You model an application's architecture (for example API Gateway → Lambda → RDS), describe what its users do, and simulate concurrent load to see where bottlenecks form: throttling, exhausted connection pools, growing queues, and rising latency.

Wind Tunnel runs entirely in the browser. There is no backend, no server calls, and nothing to deploy. Projects are saved in your browser's storage and never leave your machine.

## Status

Early development. The project scaffolding is in place; the simulation engine and UI are not built yet. See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the current milestone.

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
| `npm run simulate -- --template a` | Run a template headlessly and print a text report ([guide](docs/architecture/headless-runner.md)) |

## Documentation

Start at the [documentation hub](docs/README.md). It lists every document and a reading order for new maintainers. The most-used ones:

- [Architecture overview](docs/architecture/README.md): start here if you're new to the code
- [How the simulation engine works](docs/architecture/simulation-engine.md)
- [Implementation plan](docs/implementation-plan.md)
- [Contributing](CONTRIBUTING.md): coding standards, tests, and commit conventions

## License

[MIT](LICENSE)
