// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLoad } from "./useLoad";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A load that hands out the given promises in order, one per call. */
function loadFrom<T>(answers: readonly Deferred<T>[]): () => Promise<T> {
  let calls = 0;
  return () => {
    const answer = answers[calls++];
    if (answer === undefined) throw new Error("Loaded too often");
    return answer.promise;
  };
}

describe("useLoad", () => {
  afterEach(cleanup);

  it("starts loading, then holds what the load resolved to", async () => {
    const answer = deferred<string>();
    const load = loadFrom([answer]);
    const { result } = renderHook(() => useLoad(load));
    expect(result.current.loadable).toEqual({ status: "loading" });

    await act(async () => {
      answer.resolve("projects");
      await answer.promise;
    });

    expect(result.current.loadable).toEqual({
      status: "loaded",
      value: "projects",
    });
  });

  it("holds the error when the load rejects", async () => {
    const error = new Error("disk gone");
    const load = () => Promise.reject(error);
    const { result } = renderHook(() => useLoad(load));

    await waitFor(() => {
      expect(result.current.loadable).toEqual({ status: "failed", error });
    });
  });

  it("keeps a reload's result when the earlier load resolves after it", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = loadFrom([first, second]);
    const { result } = renderHook(() => useLoad(load));

    act(() => {
      result.current.reload();
    });
    await act(async () => {
      second.resolve("new");
      await second.promise;
    });
    await act(async () => {
      first.resolve("old");
      await first.promise;
    });

    expect(result.current.loadable).toEqual({ status: "loaded", value: "new" });
  });
});
