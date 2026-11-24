# ADR-0016: Component types list every reason they reject with

- **Status:** Accepted; amended 2026-11-24
- **Date:** 2026-10-21

## Context

A component rejects a request with a `reason`, and the reason reaches the snapshots as part of a failure's cause, such as `orders-db: too-many-connections`. [ADR-0015](0015-findings-come-from-registered-detectors.md) has each limit that refuses work declare its reason, so the findings can find the limit behind a failure by a lookup in that component's declarations ([findings design §2.4](../design/findings.md#24-how-a-failure-reaches-a-finding)).

That covers the rejections that come from a full limit. AWS services also reject for reasons that have nothing to do with capacity: an API Gateway authorizer denies a request, a DynamoDB conditional write fails, an SQS message is too large. No component models one yet, but the core AWS types will have many. Each such reason needs its own wording and fixes in the findings, and a type that returns an unexpected reason should be caught where the type is defined, not discovered in a run.

There were three ways to treat a reason that no limit declares:

1. **Allow it.** Any reason no limit declares counts as a rejection with no limit behind it. That needs nothing from types, but a capacity rejection whose limit forgot to declare its reason then looks like a legitimate non-capacity one.
2. **Require every reason to be listed.** Each type lists all its reasons; a reason on no list fails.
3. **Require every rejection to come from a limit.** That's wrong for any non-capacity rejection: a type's author would have to invent a limit to get past the check.

## Decision

**Each `ComponentDefinition` lists every reason its behavior may reject with, in `rejectionReasons`.** The list is closed and includes the reasons its limits declare. The registry's `ComponentType` exposes it, so it can be read without building a behavior.

> **Changed by the [addendum of 2026-11-24](#addendum-2026-11-24).**

`checkComponentContract` checks, for every type:

- `rejectionReasons` doesn't list `timeout` (`TIMEOUT_REASON`), which the engine puts on a failure when a caller stops waiting;
- every refusing limit's reason is on the list;
- every rejection's reason is on the list;
- a rejection whose reason a limit declares comes while one such limit is exhausted, by `limitExhausted`'s rule.

A listed reason that no limit declares is a rejection with no limit behind it, and the contract accepts it whenever it happens.

## Consequences

- One rule covers every component and every reason: no reason needs logic of its own. A new type adds entries to its own list; reasons needn't be unique across types (`throttled` is a token bucket in DynamoDB and a concurrency limit in Lambda).
- A reason missing from the list fails where the type is defined. A limit that refuses but doesn't declare it (declaring `wait`, say) still passes when its reason is listed: the rejection reads as one with no limit behind it. The type's own test of its limit values catches that, and for template types so do the rejection-reason tests over whole runs.
- The findings can count on a closed set of reasons per type, so a test can check that each one has a catalog entry with its wording and fixes (#62).
- The contract proves that no unlisted reason gets out, because it sees every rejection its scenario causes. It can't prove that every listed reason is reachable, so a stale entry isn't caught.
- A reason is now stated in three places: the rejection, the limit's declaration, and the list. Each behavior keeps its reason in one constant that all three use, and the contract checks that they agree.
- `timeout` is reserved by string only. If a component ever needs a reason with the same text, the failure should carry its origin (engine or component) as a field instead.

## Addendum, 2026-11-24

**Context.** [ADR-0025](0025-give-each-failure-an-error-kind-and-retry-by-it.md) gives each failure an error kind, so that an edge doesn't retry an error that retrying can't fix. A rejection's kind belongs to its reason, so a type has to say, for each reason it lists, what kind it is.

**Decision.** `rejectionReasons` is a record from each reason to its error kind (`throttling`, `transient`, or `non-retryable`), for example `{ "too-many-connections": "transient" }`, not a list. The set of reasons is still closed, and everything above that is checked against the list is checked against the record's keys. The contract also fails a reason whose kind isn't an error kind. Built in [#317](https://github.com/alanbickel/wind-tunnel/issues/317).

**Consequences.** A type can't list a reason without a kind. Every reason has one more value to choose, recorded with its evidence in the type's fidelity profile.

