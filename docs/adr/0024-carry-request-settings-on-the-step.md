# ADR-0024: Carry request settings on the step that calls a component

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

A component treats every call of an action alike. A DynamoDB `read` takes one capacity unit, whatever the item; an S3 `read` takes a time from its `readLatency`, whatever the object; Neptune (M8 item 12), once it exists, would run every query for the same time. In AWS the request decides much of that: a read's item size and its consistency set the units it costs ([DDB-1](../design/fidelity/dynamodb/dynamodb-fidelity.md#ddb-1-every-request-costs-one-capacity-unit)), an object's size sets its transfer time ([S3-5](../design/fidelity/s3/s3-fidelity.md#s3-5-latency-doesnt-depend-on-the-objects-size)), and a query's shape sets its time.

None of these belongs to the component. One table serves a 200-byte session lookup and a 40 KB order history; one bucket serves thumbnails and videos. They belong to the call, and a call in Wind Tunnel is a workflow step: a component and one of its type's `actions` ([domain model](../architecture/domain-model.md)). So the step needs a place for them, and the component needs to see them when the request arrives. That's an engine feature, which M8 says needs an ADR ([#300](https://github.com/alanbickel/wind-tunnel/issues/300)).

What's in place:

- **A type's settings** are a Zod `configSchema` with a `defaultConfig` on its `ComponentDefinition` ([ADR-0005](0005-use-zod-for-schema-validation.md)). A new component stores a full copy of the defaults. The registry hides each type's config type behind `ComponentType`, which checks a config and builds a behavior from it.
- **The engine calls `arrive({ request, action, nowMs })`** ([ADR-0006](0006-components-return-effects-to-the-engine.md)). `request` is already taken: it's the engine's opaque token.
- **Workflow rules are run checks** (`findStepIssues`). A project with a run issue is saved and shown, and only a run is stopped ([ADR-0019](0019-edit-projects-with-commands-and-save-each-change.md)).
- **A changed step loses what's under it.** `changeStep` rebuilds the step from its id, component, and action ([ADR-0021](0021-edit-async-work-through-the-same-commands.md) decision 3).
- **Field descriptors** in `application/details/fields/` say what each setting means to a user, with its evidence and range. The Details tab edits a component's settings through them.

## Decision

### 1. A type declares settings per action, with a default for each

1. **`ComponentDefinition` gains an optional `requestSettings`:** for each action that takes settings, a Zod object schema. A DynamoDB `read` and `write` take different settings, so each action has its own. A type or action with none leaves it out.
2. **Every field in such a schema has a Zod `.default()`.** The defaults live in the schema, not in a separate object as `defaultConfig` does, because a step stores only what it sets (decision 2): parsing a step's settings fills in the rest, and parsing `{}` gives all the defaults. `checkComponentContract` fails a schema that doesn't parse `{}`.
3. **The schema is strict.** An unknown key is an issue, as it is in the project document.
4. **A setting may be any value a field descriptor can show:** today a number, a whole number, or a duration distribution (`Distribution`). A new field kind, such as a choice between named values, comes with the first type that needs it (DDB-1's read consistency, [#301](https://github.com/alanbickel/wind-tunnel/issues/301)).
5. **The registry hides the types, as it does for config.** `ComponentType` gains `checkSettings(action, settings)`, which returns issues with paths relative to the settings, and `parseSettings(action, settings)`, which returns them with the defaults filled in and throws if they're invalid. An action with no schema takes the empty strict object: no settings is valid, and any key is an issue.

### 2. A step stores only what it sets

1. **`Step` gains an optional `settings`** (decided 2026-11-20). It holds only the values set for this step. A step that sets none has no `settings`, so every template and saved project stays as it is.
2. **A value equal to the type's default isn't stored.** The edit that sets it removes its key, and removes `settings` when nothing's left. Setting a value back to its default makes the step follow the default again, with no "reset" control.
3. **The cost:** a step that doesn't set a value follows the type's default, so changing a default in code changes every such step's run. That's the same as for any default in the model, and M8 already accepts that template results change.
4. **The document** gains an optional `settings` on a step: a record of unknown values, checked for shape only, as a component's `config` is. Its meaning is checked against the called type (decision 4). The schema version doesn't change, since a document without it is still valid.

### 3. The engine passes them through

1. **`ArriveInput` gains `settings`:** the step's settings for this action, parsed, with the defaults filled in, and `{}` for an action that has none. Its type is `RequestSettings`, a readonly record of unknown values. A type reads them as its schema's output type: the registry has parsed them with that schema, so the cast is safe, and the type's tests show it.
2. **Parsed once per step, when the run is built.** The topology parses each step's settings with its target's type, beside building each component, and `arrive` reads the result. Nothing is parsed per arrival, and a step with no settings costs one parse of `{}`.
3. **The engine never reads them.** It hands them to `arrive`, as it hands over `action`. `finish` and `dispatchFinished` don't get them: a type that needs them later keeps what it needs with the request it holds.
4. **A component gets one complete set of settings per arrival, and never sees where it came from.** Choosing the settings for an arrival is the engine's job; today that choice is trivial, because a step's settings are the same for every arrival. Anything that later varies a request's settings (a mix of profiles, a request class, the workload's time) changes how the engine chooses them, not what a type receives, so no type changes when it arrives ([What this leaves open](#what-this-leaves-open)). A type may still vary its own work within a setting, by sampling a distribution (decision 6).

### 4. Settings that don't fit are a run issue

1. **`findStepIssues` checks each step's settings** with its type's `checkSettings`, after its action: a new step issue, `invalid-request-settings`, one per problem, with its path into the step's `settings` (for example `["workflows", 0, "root", "calls", 1, "settings", "itemSizeKb"]`) and the problem.
2. **It's a run issue, not a load error.** Whether settings fit depends on the step's target and action, which are themselves run checks, so a project with settings that don't fit opens, shows the issue on the step, and stops only a run.
3. **Settings aren't checked when the action isn't accepted, or the component doesn't exist.** The step already has `action-not-accepted` or `unknown-component`, and settings can't be checked against a type or action that isn't there.

### 5. Changing or removing what a step calls

1. **Any change of a step's component or action drops its settings** (decided 2026-11-20), the same rule as for `calls` and `async` ([ADR-0021](0021-edit-async-work-through-the-same-commands.md) decision 3). Settings belong to an action of a type; there's one rule, and the editor can't produce settings that don't fit.
2. **It doesn't ask first.** Unlike the steps under a step, settings are a few values, not work: one undo brings them back. The announcement says they're gone, when the step had any: "Changed orders-table · read to orders-table · write. Its request settings are gone."
3. **Removing a component leaves its steps, settings included.** Each such step has `unknown-component` already, and its settings aren't checked (decision 4.3). They go when the user changes or removes the step.
4. **The step rebuilds name it.** The helpers that rebuild a step field by field when its last call or its async work goes must keep `settings` ([Gotchas](../../CONTRIBUTING.md#gotchas)). `changeStep` rebuilds a changed step from its id, component, and action, so it drops them already.

### 6. Distributions and determinism

1. **A setting may be a distribution**, such as a query's time on a Neptune step. The step holds the distribution as data; the component samples it when it uses it, in `arrive`, from the random source its `build` got.
2. **A run stays deterministic for a seed.** Each component has its own seeded stream, `component:<id>`, and the engine calls `arrive` in a fixed order, so the same seed gives the same draws in the same order, whether they come from a config setting or a step's. A type that moves a time from its config to its steps changes which distribution each draw uses, not the order of the draws.

### 7. Names

- **"Request settings"** in docs and on screen: the settings of one request to a component, as opposed to the component's settings and an edge's.
- **`settings`** in code, on `Step`, in the document, and on `ArriveInput`; **`requestSettings`** on `ComponentDefinition`, where `settings` alone could mean the config; **`RequestSettings`** for the parsed type.

## What this leaves open

A step carries one set of request settings, so today a different kind of request to the same component is a different workflow, weighted in the workload's mix. That fits some cases and not others. This section names the ways requests vary, where each would fit, and what it would build on. None is decided here; each needs its own design when a type or a template needs it.

| Variation | Example | Where it would fit |
|---|---|---|
| Within one kind of request | Query times that spread around a median | A distribution setting, which the type samples (decision 6). Available now. |
| A different journey or path | Loading a page vs. watching a video | Separate workflows in the workload's mix. Available now. |
| The same call with mixed payloads | A REST handler's S3 reads: mostly 2 KB assets, some 5 MB images | A weighted mix of named profiles on the step, one chosen per call. |
| A kind of request that holds at every step | A "video" request: large at S3, long in Lambda, heavy in the cache | A request class chosen once per request, at the workflow's root, that each step keys its settings by. |
| The same profile in many workflows | An "order item" read in checkout, history, and admin | Named profiles at the project level, which steps refer to. |
| Payloads that change over the day | Larger uploads in the evening | Settings that vary with the workload's time. |
| Which steps run | A cache hit skips the database; large uploads go multipart | Branches in the workflow, chosen by a weight, a request class, or a call's outcome. |
| How many calls a request makes | A GraphQL query that resolves 20 items | A repeat count or parallel calls on a step (M8 item 23). |

Two things to know before designing any of these:

- **Per call or per request.** A mix drawn at each step is independent at each step: a request could draw a large S3 read and a small Lambda compute. Where a request's kind should hold across its steps, the choice belongs to the request (a class), not the call.
- **Names make findings.** Anonymous draws, from a distribution or an unnamed mix, can only show up as spread. A named profile or class lets a finding say "the 5 MB reads time out", which is the north star, and it means the engine marks each arrival with its profile, for the metrics to count by.

Every row leaves decisions 1 to 6 standing. The types' schemas, a step's partial settings, the run check, and `ArriveInput` stay as they are, because each row changes only how the engine chooses an arrival's settings (decision 3.4), or which steps run. A design that needed a type to know which profile or class it's serving would break that, and would need to supersede this decision.

Until one of these exists, the guidance is the second row: a different kind of request is a different workflow. The component definitions guide says when a setting belongs on the step and when in the config; the workflow guidance in the UX design, and any template that needs a mix, should be revisited when the first of these is designed. S3's object size (S3-5) is the likely first case, because object sizes are often a mix of very small and very large.

## Consequences

- **A type can let the request decide its cost or time** without an engine change: DDB-1 (#301), Neptune's query time (M8 item 12), and S3-5 each declare settings and read them in `arrive`.
- **Nothing changes until a type declares settings.** No template or saved project has `settings`, and every action parses `{}`, so `npm run simulate` gives the same report before and after.
- **Two places say what a type takes:** its config for the component, and its request settings for each action. A type's author chooses between them: a setting that differs between calls to the same component belongs on the step; one that's the same for every call belongs in the config. "Adding a component type" says so.
- **Defaults are in the schema here and in `defaultConfig` for config.** It's a second pattern, chosen because a step stores only what it sets. The field descriptors for request settings show the default by parsing `{}`.
- **The behavior reads settings through a cast.** `ArriveInput` isn't generic over each action's settings, because one behavior serves every action and the registry hides the types. The cast is safe because the registry parsed them with the same schema; a type's tests show the values it reads.
- **Mixed requests to one component need one workflow each, for now.** A handler whose S3 reads are a mix of sizes is modeled as several workflows, weighted in the mix, until a design from [What this leaves open](#what-this-leaves-open) arrives. Because a type never sees where its settings came from (decision 3.4), that design won't change any type.
- **A default change reaches every step that doesn't set the value**, by design (decision 2.3).
- **Changing a step's action loses its settings without asking**, unlike its calls. One undo brings them back.
- **Follow-up:** [#304](https://github.com/alanbickel/wind-tunnel/issues/304) builds decisions 1 to 4 and 5.4 with a test type, and appends an addendum to ADR-0006, whose table quotes `arrive(request, action, nowMs)`. [#305](https://github.com/alanbickel/wind-tunnel/issues/305) builds the editor: the field descriptors for request settings, the edit command (decision 2.2), and decisions 5.1 and 5.2.
