# Cloud Builder

Cloud Builder is a browser-based simulator for cloud architectures. You model an application's architecture (for example API Gateway → Lambda → RDS), describe what its users do, and simulate concurrent load to see where bottlenecks form: throttling, exhausted connection pools, growing queues, and rising latency.

It runs entirely in the browser. There is no backend and no account; projects are saved in your browser's storage.

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
| `npm run lint` | ESLint, including the architecture layer rules |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | TypeScript checks for all projects (`tsc -b`) |

## Documentation

- [Architecture overview](docs/architecture/README.md): start here if you're new to the code
- [Architecture decision records](docs/adr/)
- [MVP design](docs/design/mvp-design.md)
- [Implementation plan](docs/implementation-plan.md)
- [AWS: Did you know?](docs/learning/aws-did-you-know.md): AWS facts collected along the way

## License

[MIT](LICENSE)
