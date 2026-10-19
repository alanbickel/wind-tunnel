/** Called when a `StopSignal` fires. */
export type StopListener = () => void;

/**
 * Tells long-running work to stop. It's the part of the DOM's `AbortSignal`
 * that runners need, declared here because `application/` is checked
 * without the DOM's types, so in the browser `new AbortController().signal`
 * can be passed as is. Tests use `ManualStopSignal`.
 */
export interface StopSignal {
  /** True once the signal has fired. */
  readonly aborted: boolean;
  /** Calls `listener` when the signal fires; not if it already has. */
  addEventListener(type: "abort", listener: StopListener): void;
  removeEventListener(type: "abort", listener: StopListener): void;
}
