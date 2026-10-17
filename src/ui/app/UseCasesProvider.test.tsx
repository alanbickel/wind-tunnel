import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fakeUseCases } from "./testing/fake-use-cases";
import type { UseCases } from "./use-cases";
import { UseCasesProvider } from "./UseCasesProvider";
import { useUseCases } from "./useUseCases";

interface ProbeProps {
  readonly onRender: (useCases: UseCases) => void;
}

/** Hands the hook's result to the test. */
function Probe({ onRender }: ProbeProps) {
  onRender(useUseCases());
  return null;
}

describe("UseCasesProvider and useUseCases", () => {
  it("give a component below the provider the use cases it was given", () => {
    const useCases = fakeUseCases();
    let seen: UseCases | undefined;

    renderToString(
      <UseCasesProvider useCases={useCases}>
        <div>
          <Probe onRender={(found) => (seen = found)} />
        </div>
      </UseCasesProvider>,
    );

    expect(seen).toBe(useCases);
  });

  it("let a component call a use case through context", async () => {
    const summaries = [{ id: "p1", name: "Checkout", updatedAt: "now" }];
    const useCases = fakeUseCases({
      listProjects: { execute: () => Promise.resolve(summaries) },
    });
    let listed: Promise<unknown> | undefined;

    renderToString(
      <UseCasesProvider useCases={useCases}>
        <Probe
          onRender={(found) => {
            listed = found.listProjects.execute();
          }}
        />
      </UseCasesProvider>,
    );

    await expect(listed).resolves.toBe(summaries);
  });

  it("throw when the hook is used outside a provider", () => {
    expect(() => renderToString(<Probe onRender={() => undefined} />)).toThrow(
      "useUseCases must be called inside a UseCasesProvider.",
    );
  });
});
