# The Domain Model

A short introduction to the entities that describe a project, and the rules that keep them consistent. For maintainers new to the code. The full design is in [MVP design §3](../design/mvp-design.md#3-domain-model); this page explains the shape and the reasoning.

Code: [`src/domain/model/`](../../src/domain/model/).

## The entities

A **project** holds three things: an **architecture** (what exists), **workflows** (what one request does), and **workloads** (how many requests arrive, and when).

```mermaid
flowchart LR
    subgraph P[Project]
        direction LR
        subgraph A[Architecture]
            C[Components]
            E[Edges]
        end
        WF[Workflows<br/>call trees of Steps]
        WL[Workloads<br/>mix + rate profile]
    end
    WF -->|steps target| C
    WF -.->|each call follows| E
    WL -->|mix weights| WF
```

The entities are plain readonly data with no methods, defined in [`project.ts`](../../src/domain/model/project.ts). Behavior lives elsewhere: in the behavior primitives, component definitions, and the engine. Layout positions and timestamps are not part of the domain; they stay in the stored project document ([ADR-0004](../adr/0004-persist-projects-in-indexeddb.md)).

## Workflows are call trees laid over the architecture

The key idea: the architecture is a map of **who can call whom**, and a workflow is **one route through that map**. Each step targets a component, and its nested `calls` are made while that step is still running and holding its resources.

Template B's "Create order", with the workflow's calls drawn over the architecture's edges:

```mermaid
flowchart LR
    api[api] ==>|invoke| fnapi[fn-api]
    fnapi -.-> read[(orders-read)]
    fnapi ==>|enqueue| q[[orders-queue]]
    q ==>|"async: invoke (later)"| w[fn-writer]
    w ==>|write| db[(orders-db)]
```

Thick arrows are this workflow's calls; the dotted one is an edge this workflow doesn't use ("Get order" does). Every thick arrow must sit on an edge, because the edge supplies the call's latency, timeout, and retry policy. The `async` step is different from a nested call: the user's request completes once the message is enqueued, and the queue calls `fn-writer` later.

## Validation: who checks what

Data is checked in two stages when a project is loaded:

| Stage | Where | Checks |
|---|---|---|
| 1. Shape | Zod document schema in `adapters/` (planned) | Fields exist and have the right types; numbers are in range (e.g. timeouts are positive) |
| 2. Consistency | [`validateProject`](../../src/domain/model/validate-project.ts) in `domain/` | Rules that span the whole project, listed below |

Consistency rules:

- IDs are unique within components, edges, workflows, and workloads.
- Edges connect two different, existing components, and there's at most one edge per direction between a pair.
- Every step targets an existing component, and every call (including `async` ones) follows an edge in the right direction.
- Only `enqueue` steps have `async` work.
- A workload's mix is non-empty, names existing workflows once each, and has positive weights.
- A workload's profile is non-empty, its times strictly increase, and its rates aren't negative.

`validateProject` returns **every** problem with a path to it, rather than throwing on the first, so the UI can show them all. From [`validate-project.txt`](../../src/domain/traces/validate-project.txt):

```text
path                          message
architecture.edges.2.to       Edge "fn->cache" refers to unknown component "cache".
workflows.0.root.calls.0      No edge from "api" to "db"; every call must follow an edge.
workloads.0.mix.0.workflowId  Mix refers to unknown workflow "gett".
workloads.0.profile.1.atSec   Profile times must increase; 0 s comes after 0 s.
```

Rules that depend on a component's type (for example, "only queues accept `enqueue`" or "this Lambda's config is valid") belong to the component definitions, not here. That keeps this validator unchanged when new component types are added.
