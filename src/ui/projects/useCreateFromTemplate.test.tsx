// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { inMemoryUseCases } from "../app/testing/in-memory-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { useCreateFromTemplate } from "./useCreateFromTemplate";

interface WrapperProps {
  readonly children: ReactNode;
}

describe("useCreateFromTemplate", () => {
  afterEach(cleanup);

  it("ignores a second create while the first is still running", async () => {
    const { useCases, projects } = inMemoryUseCases([sampleRecord]);
    const onCreated = vi.fn();
    const wrapper = ({ children }: WrapperProps) => (
      <UseCasesProvider useCases={useCases}>{children}</UseCasesProvider>
    );
    const { result } = renderHook(() => useCreateFromTemplate(onCreated), {
      wrapper,
    });

    act(() => {
      result.current.create("sample");
      result.current.create("sample");
    });

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(await projects.list()).toHaveLength(1);
  });
});
