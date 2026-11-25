/**
 * What kind of error a failure is, named as the AWS SDKs name them
 * (ADR-0025 decision 1.1): a throttle, a transient error, or one that
 * retrying can't fix. Throttling and transient errors are retryable.
 */
export type ErrorKind = "throttling" | "transient" | "non-retryable";

/** Every error kind, for checking a value that came from outside the types. */
export const ERROR_KINDS: readonly ErrorKind[] = [
  "throttling",
  "transient",
  "non-retryable",
];

/** Whether an edge's policy may retry a failure of each kind (decision 2.1). */
export const RETRYABLE: Readonly<Record<ErrorKind, boolean>> = {
  throttling: true,
  transient: true,
  "non-retryable": false,
};

/** The kinds a policy may retry, each with a base delay of its own. */
export type RetryableKind = Exclude<ErrorKind, "non-retryable">;

/** Whether a failure of `kind` may be retried, by `RETRYABLE`. */
export function isRetryable(kind: ErrorKind): kind is RetryableKind {
  return RETRYABLE[kind];
}

/**
 * Every reason a type may reject with, each with its error kind, e.g.
 * `{ "too-many-connections": "transient" }` (ADR-0025 decision 1.2).
 */
export type RejectionReasons = Readonly<Record<string, ErrorKind>>;
