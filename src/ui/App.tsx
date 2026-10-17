import type { UseCases } from "./app/use-cases";
import { UseCasesProvider } from "./app/UseCasesProvider";

export interface AppProps {
  /** Built by the composition root, `main.tsx`. */
  readonly useCases: UseCases;
}

/** The app shell: provides the use cases to every screen below it. */
export function App({ useCases }: AppProps) {
  return (
    <UseCasesProvider useCases={useCases}>
      <main>
        <h1>Wind Tunnel</h1>
        <p>Cloud architecture workload simulator. Under construction.</p>
      </main>
    </UseCasesProvider>
  );
}
