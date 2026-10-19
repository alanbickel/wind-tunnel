import { describe, expect, it, vi } from "vitest";
import { ManualStopSignal } from "./manual-stop-signal";

describe("ManualStopSignal", () => {
  it("fires each listener once and stays aborted", () => {
    const signal = new ManualStopSignal();
    const listener = vi.fn();
    signal.addEventListener("abort", listener);
    expect(signal.aborted).toBe(false);

    signal.stop();
    signal.stop();

    expect(signal.aborted).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("doesn't call a removed listener", () => {
    const signal = new ManualStopSignal();
    const listener = vi.fn();
    signal.addEventListener("abort", listener);
    signal.removeEventListener("abort", listener);

    signal.stop();

    expect(listener).not.toHaveBeenCalled();
  });
});
