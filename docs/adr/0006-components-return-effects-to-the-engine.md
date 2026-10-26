# ADR-0006: Components return effects to the engine; they never schedule events

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The engine must simulate five very different services (API Gateway, Lambda, DynamoDB, RDS, SQS), and more later, without knowing any of them by name ([ADR-0002](0002-use-clean-architecture-layering.md), Open/Closed). Each component type is a definition built from behavior primitives ([MVP design §3.1](../design/mvp-design.md#31-components-are-built-from-behavior-primitives)). We need one interface between the engine and every component's run-time state that:

- covers rejection (throttling), waiting (RDS query workers), service time, and later-starting work (SQS delivering to a consumer);
- lets a freed resource start a *different* request (a slot passed to a waiter);
- keeps components deterministic and easy to test without an engine;
- is small enough that a shared contract test can check every definition.

Two other shapes were considered. Components that schedule their own events would need access to the event queue and clock, and the engine's tie-breaking guarantees would depend on each component's discipline. Callback-based components (`onStarted(request)`) hide the control flow and make the order of side effects hard to see in tests.

## Decision

A component definition builds a `ComponentBehavior<T>` (`src/domain/components/`). The engine calls it, and it answers with a list of **effects**:

| Engine calls | Component may return |
|---|---|
| `arrive(request, action, nowMs)` | exactly one outcome for that request: `started` (with `serviceMs`), `queued`, or `rejected` (with a reason) |
| `finish(request, nowMs)` | `started` for waiters that got the freed resources; `dispatched` for queue-like types |
| `dispatchFinished(request, succeeded, nowMs)` (queue-like types only) | more `dispatched`, including redeliveries of failed work |

Rules:

- **The component never schedules events or reads a clock.** The engine turns effects into events. Time is passed in.
- **Request tokens are opaque.** The component holds and returns the engine's token; it never looks inside.
- **No cancellation.** When a caller times out, it stops waiting, but the callee carries on and is still finished normally. This matches AWS (a query keeps running after the Lambda that sent it gives up) and means every accepted request is started once and finished once.
- **Order of work at a step:** the step's own service time first, then its nested calls in order, then `finish`. The engine owns this sequence.
- **Queue-like types** set `deliversAsync` on their definition. They hold finished requests as messages and return `dispatched` when the `async` step should start.
- **Gauges** `inProgress` and `queueDepth` are exact, and they're derivable from the effects; the contract test checks them after every call.
- **Every definition passes `checkComponentContract`**, which drives it through an overload scenario and checks all of the above, plus determinism.

The definition interface adds `actions` (step actions the type accepts) and `deliversAsync` to the one sketched in the MVP design; `validateComponents` uses both to check projects.

## Consequences

- The engine stays generic: it knows four effect kinds, not five service types. New types need a definition, a registration, and a passing contract test.
- Components are plain state machines: unit tests call methods and compare returned arrays, with no event loop.
- Behaviors that need their own timers (e.g. SQS long-polling delays, Lambda instances expiring in the background) aren't expressible yet. Lazy evaluation on the next call covers the MVP (Lambda checks idle time when a request arrives). A `wake-at` effect can be added later if needed.
- Wasted work after a timeout is simulated, which is realistic and important for retry storms, but it means a timed-out request still consumes capacity until it finishes.
- Type-specific gauges (e.g. RDS connections held, separate from queries running) don't fit the two generic gauges; they'll need an extension when metrics are built.

## Addendum, 2026-10-15

The methods in the table above now take one input object instead of positional parameters, to follow the coding standards' limit of two parameters (CONTRIBUTING, rule 7):

| Before | Now |
|---|---|
| `arrive(request, action, nowMs)` | `arrive({ request, action, nowMs })`, an `ArriveInput<T>` |
| `finish(request, nowMs)` | `finish({ request, nowMs })`, a `FinishInput<T>` |
| `dispatchFinished(request, succeeded, nowMs)` | `dispatchFinished({ request, succeeded, nowMs })`, a `DispatchFinishedInput<T>` |

What each method may return, and every rule above, is unchanged. Measured with the engine's million-event test, the input objects cost nothing noticeable. At the same time, each definition's `build` started returning an instance of a named class (e.g. `LambdaBehavior`) instead of an object literal; that's a code-structure change and doesn't affect this decision.

## Addendum, 2026-10-26

The checks that use `actions` and `deliversAsync` moved from `validateComponents` to `findStepIssues`, when the project's checks were split into architecture checks and run checks ([ADR-0019](0019-edit-projects-with-commands-and-save-each-change.md), [#94](https://github.com/alanbickel/wind-tunnel/issues/94)). A step whose action its component doesn't accept is now a run issue: it stops a run of the workloads that use the workflow, not a save or an open. `validateComponents` keeps the checks on the components themselves. This decision is unchanged.
