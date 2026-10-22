# ADR-0017: Count failed async deliveries by cause

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

A request that fails reaches the snapshots with its cause: `workflows.failures` counts final failures by `"<component>: <reason>"`, such as `orders-db: too-many-connections`, and the findings resolve each cause to the limit that refused it ([findings design §2.4](../design/findings.md#24-how-a-failure-reaches-a-finding)).

A queue's failed delivery doesn't. When a queue's `async` work fails, the engine's `onSettled` callback receives the `Failure`, with its component and reason, but it reports only `succeeded: false` to the observer, so `ComponentMetrics.asyncFailed` is a count with no cause. The failed message goes back to the backlog (fidelity [SQS-1](../design/fidelity.md#sqs-1-failed-messages-come-back-immediately)), no request fails, and no detector can say what refused it.

The findings design for such a run ([§1.8](../design/findings.md#18-variant-template-b-lunch-rush-database-connections-cut-to-10-healthy-with-failed-deliveries)) tried to infer the cause from the counts that exist. In that run, orders-db's `rejected`, fn-writer's `failed`, and orders-queue's `asyncFailed` are all 90, but the equality isn't a trace:

- **A callee can have other callers.** If orders-db also served synchronous requests, its `rejected` would mix their refusals with the deliveries'.
- **A delivery can fail for several causes.** fn-writer could be throttled while orders-db refuses, and `asyncFailed` wouldn't say how many of each.
- **Even the seconds don't line up.** A failure is counted when the delivery ends, a little after the refusal. In the long-rush variant, a refusal just before 119 s was counted in the second ending at 119 s, and its failed delivery in the next one, so the two series differ in two seconds.

## Decision

1. **The engine reports the cause of a failed delivery.** `ComponentAsyncFinishedEvent` carries the `Failure` that ended a failed delivery, or none for one that succeeded, as `workflow-finished` carries a request's.
2. **Metrics count failed deliveries by cause.** `ComponentMetrics` gains `asyncFailures`, failed deliveries by cause, keyed in the same `"<component>: <reason>"` form as `workflows.failures`. `asyncFailed` stays, and equals the sum of `asyncFailures`; a reconcile test checks it.
3. **The precedent:** where the engine counts a final outcome, a request's or a delivery's, a failed outcome carries its cause, so a finding can trace it instead of inferring it.

## Consequences

- A failed-deliveries detector resolves each cause to its limit with the same lookup as failed-requests (ADR-0015), and retries-absorbed can tell a refusal that a queue redelivered from one that a caller retried.
- `MetricsSnapshot` changes shape. Snapshots aren't persisted, so no stored data needs migrating, but every place that builds a `ComponentMetrics` (the collector and test fixtures such as `sample-snapshots.ts`) gains the field.
- Snapshots grow by one record per component; it's empty for every component but a queue whose deliveries failed.
- The rule doesn't reach the per-component counts of attempts, which aren't final outcomes. `rejected` counts refused attempts, retried ones included, without their reason (§2.4). `failed` counts a component's work that ended because a nested call failed (fn-writer's 90 in §1.8); its cause is that call's, and it reaches the request's or the delivery's outcome. `timeouts` counts callers that gave up, and is itself a cause, the callee and `timeout`. Counting any of them by cause would follow the same pattern if a detector needs it.
