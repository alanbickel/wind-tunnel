# ADR-0003: Build a browser-only app with TypeScript, React, and Vite

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Cloud Builder is a personal learning project that will be published as a public repository. Anyone curious should be able to try it with no account, no install, and no hosting costs for the maintainer. The simulation is CPU-bound but small enough to run on a typical laptop.

The maintainer is fluent in TypeScript and wants to build React experience along the way.

## Decision

- **Language:** TypeScript in strict mode throughout.
- **UI:** React.
- **Build tooling:** Vite.
- **Runtime:** browser only, with no backend. The simulation engine runs in a Web Worker so the UI stays responsive.
- **Hosting:** static hosting (e.g. GitHub Pages).

Specific UI libraries (canvas, charts, state management) will be chosen in separate ADRs when they're needed.

## Consequences

- Zero hosting cost and zero setup for users.
- No server-side persistence; saving and sharing rely on browser storage, file export, or URL encoding.
- Simulation size is limited by the user's machine. Large-scale simulations may need aggregate (queueing-math) modeling rather than following every individual request.
- If a backend is ever needed (e.g. shared galleries of architectures), it would be a new adapter and a new ADR.
