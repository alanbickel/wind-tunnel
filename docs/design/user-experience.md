# User Experience: Modeling Your Own Architecture

Wind Tunnel exists so a developer can represent their own system and see how it behaves. Through M5, a user could only copy a template and run it, on a screen built for reading a run: the diagram on one side, and the run's verdict, findings, totals, and charts on the other. M6 ("Model my own architecture") lets the user build and change a project of their own. The templates become starting points, and the run, verdict, and findings work on whatever the user builds. This page designs the whole experience before any M6 code ([#81](https://github.com/alanbickel/wind-tunnel/issues/81)), so each new feature fits one design rather than being added to the screen on its own. ADRs record the decisions that are hard to reverse.

The method is the one [findings.md](findings.md) used. Write journeys as a user would live them ([§2](#2-journeys)). Then work out the layout ([§3](#3-layout)), the interaction model every panel shares ([§4](#4-interaction-model)), and the data each step needs ([§5](#5-data-needs)). Last, cut the work into the Roadmap's items ([§6](#6-slices)).

The build order: view and edit a component's settings, then add and remove components, start a blank project, and rename the project, then the workflow step editor. The first slices are designed in depth. The later ones get just enough design that the edit model and layout won't need redoing for them.

## How to read this page

Times, the evidence tags ([totals], [snapshots], [config]), and the levels of an AWS claim (Documented, Observed, Assumption) are findings.md's: see [How to read that page](findings.md#how-to-read-this-page). This page adds two marks:

- **New** marks screen text this design proposes. Unmarked screen text in a quote is what the screen shows today.
- **Proposed** marks a step that needs a decision from a later section, and links it. The journeys come first, so that those sections answer to them.

## 1. The modeling loop

Modeling is a loop, and the user goes round it many times in one sitting. **Describe** part of your system: a component and its settings, the path a request takes through it, the traffic it faces. **Check** that Wind Tunnel's picture matches the system in your head: the diagram shows what connects to what, the drawer shows each setting with what it means in AWS terms, and validation says what's missing or can't run. **Run** it, and read the verdict and findings. Then change something and go round again. The loop is only as fast as its slowest step, so no step may need a reload, a separate screen, or a save that can fail late. Every M6 feature serves one of the three steps for a system the user brings; a feature that doesn't waits.

## 2. Journeys

Each journey goes step by step: what the user does, and what the screen shows in reply. Where a journey runs the project, the run is seed 42, from `npm run simulate`, and its numbers are quoted from the CLI's report, which shows the same verdict and findings as the run panel. §2.1's project isn't a template: [Appendix A](#appendix-a-the-link-shortener) has it, and says how to run it.

### 2.1 Model your own system

You run a link shortener on AWS: API Gateway in front of one Lambda function, `fn-links`, which reads and writes one DynamoDB table, `links`. It serves about 300 requests a second, 95% of them people following a link. Next week a launch will send ten times that for 30 s, and you want to know if it holds.

1. **Start.** On the projects screen, under the templates, you choose **New** "Start a blank project". A name field asks for the project's name; you type "Link shortener" and press Enter. The project screen opens on an empty diagram: **New** "No components yet. Add one to start describing your system." beside an "Add component" button. The run panel says what it says today for a project without workloads: "This project has no workloads to run." **Proposed:** what a blank project holds ([§5](#5-data-needs)).
   *Shortcut:* copy Template A instead, which has the same shape with RDS where you have DynamoDB, and swap the database ([§2.4](#24-add-a-component-and-remove-one)).
2. **Add the API.** "Add component" lists the five types, each with a line on what it's for: **New** "API Gateway: the front door; throttles requests over its rate." You choose it. A box appears on the diagram, selected, and the details drawer opens beside the diagram with the name field focused: **New** "api-gateway-1". You name it "api". Its settings show their defaults, each with its unit and help: "Rate, requests/s: 10,000. The default is the account's limit per Region, shared by every API in it ([APIGW-1](fidelity.md#apigw-1-the-throttle-limit-belongs-to-one-component-not-the-account))." You keep them. **Proposed:** the drawer ([§3](#3-layout)), the field descriptors and component names ([§5](#5-data-needs)).
3. **Add the function, translating a real setting.** You add a Lambda and name it "fn-links". Your real function has reserved concurrency 100. The concurrency field's help says how that maps: **New** "Invocations running at once before Lambda throttles. In AWS, the function's reserved concurrency, if it has one; otherwise the account's unreserved pool, shared by every function ([LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account))." You enter 100. The drawer says the new component isn't used yet: **New** "Nothing calls fn-links yet. A component does nothing until a workflow step calls it."
4. **Add the table, translating a setting that doesn't map one to one.** You add a DynamoDB table, "links". Yours is provisioned at 400 read and 100 write capacity units, and your code reads with the default, eventually consistent reads. The read units' help: **New** "Reads a second before DynamoDB throttles; each read here uses one unit. In AWS, an eventually consistent read of up to 4 KB uses half a unit, so for those, enter twice your read capacity units." That's **Documented** ([DDB-1](fidelity.md#ddb-1-every-request-costs-one-capacity-unit)). You enter 800 reads and 100 writes. Burst's help says AWS keeps up to 300 s of unused capacity but doesn't promise it ([DDB-2](fidelity.md#ddb-2-the-burst-bucket-starts-full-and-is-reliable)); you keep the default, 300. The diagram has three boxes and no arrows: nothing connects yet, and the text version under it says so.
5. **Describe a request's path.** In the workflow step editor you add a workflow, "Follow link". Its first step is a call to `api`; under it, a call to `fn-links`; under that, a `read` of `links`. Each picker offers only what's possible: the actions a type accepts (`links` offers `read` and `write`). A call between two components with no edge yet creates one, and its arrow appears on the diagram as you add the step. You add "Shorten" the same way, ending in a `write`; it reuses both edges. You select the `api → fn-links` arrow to check it: its timeout is 29,000 ms, with the help "API Gateway waits up to 29 s for an integration by default" (**Documented:** [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)). **Proposed:** a call creates its edge, and where edges come from ([§4.3](#43-editing-and-saving), [§5](#5-data-needs)); the step editor's place ([§3](#3-layout)).
6. **Set the traffic.** In the workload editor you add "Launch spike": 60 s, seed 42, a mix of Follow link 95 and Shorten 5, and a profile of 300 requests a second for 10 s, 3,000 from 11 s to 40 s, then 300 again. The run panel now offers it.
7. **Check the picture.** The diagram shows `api → fn-links → links`, and validation finds nothing. **Proposed:** where validation shows when it does find something ([§5](#5-data-needs)).
8. **Run it.** You click Run. When it finishes:
   > **Failing.** 4,572 of 98,898 answered requests failed (4.6%); 11 were still in progress when the run ended.

   The one finding: "Failure: 4,572 requests failed with fn-links: throttled, from 10 s to 41 s." fn-links held all 100 of its concurrency in every second with these failures, and the failures stopped when the spike did. [totals: Failures; Limits `concurrency` 100 of 100] The finding names fn-links; you select it, and fn-links is highlighted on the diagram. **Proposed:** selection ([§4.1](#41-selection)).
9. **Read what the verdict doesn't say.** The Limits table shows that reads drew up to 2,762 tokens a second from `links`, against 800 provisioned, and the table still refused nothing: its 240,000-token burst (800 × 300 s) was at most 23.5% drawn. [totals: Limits `readUnits`] Your table survived the spike on saved-up capacity, which AWS doesn't promise. You select `links`, set burst to 5 s, and run again:
   > **Failing.** 58,000 of 98,898 answered requests failed (58.6%); 11 were still in progress when the run ended.

   Now the first finding is `links: throttled`, 56,888 failures, with a note that the 4,000-token bucket "lasted between 2 s and 3 s" at 2,108 tokens a second against a refill of 800. Its fix: provision read units for the sustained rate. [totals: Failures; the finding's sentences] Before the second run, while you changed burst, the run panel marked the first run as out of date: **New** "This run is of an earlier version of the project. Run again to see your changes." **Proposed:** run freshness ([§4.2](#42-run-freshness)).
10. **Undo, and fix the function.** You undo the burst change (Ctrl+Z, or the Undo button), and burst is 300 again. The run on screen is the 5 s one, so it's still marked out of date. You set fn-links' concurrency to 200 (in AWS, raising its reserved concurrency; up to 900 can be reserved, [LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account)) and run:
    > **Failing.** 13 of 98,900 answered requests failed (0.0%); 9 were still in progress when the run ended.

    All 13 failed in the second ending at 12 s, the spike's first full second, when fn-links held all 200; for the rest of the spike its concurrency peaked at 131. [the finding's sentences] fn-links cold-started 200 environments over the run [totals: Components `coldStarts`], but nothing on screen says the onset's cold starts are why it hit 200: the finding has no fix for Lambda throttling yet ([§7](#7-not-yet)).

This journey needs every M6 slice. Steps 1 to 4 and 8 to 10 are the first slices; 5 and 6 are the step and workload editors.

### 2.2 Edit a component's settings

You copied Template A and ran its lunch rush: "Failing. 28,841 of 65,963 answered requests failed (43.7%)". The finding's note says requests waited for orders-db's query workers, and its first fix is "Raise queryWorkers, so queries stop waiting for a worker".

1. **Open.** You select orders-db, on the diagram or in its text version. The drawer opens with its settings: max connections 90, query workers 16, query time "lognormal, median 15 ms, p99 60 ms". Query workers isn't an AWS setting, and its help says so: **New** "How many queries the database runs at once, standing in for its CPU. RDS has no such setting: a larger instance class has more CPU." That's the model's assumption, [RDS-2](fidelity.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers).
2. **A plain number.** You set query workers to 64. The change saves as you leave the field (or press Enter), and the run is marked out of date. You run again:
   > **Healthy.** All 65,961 answered requests succeeded; 13 were still in progress when the run ended.
   > Closest to failing: orders-db connections, at most 60 of 90 (66.6%).

   [totals: Limits `queryWorkers` peak 60 of 64] **Proposed:** a change saves when its field is left, not with a Save button ([§4.3](#43-editing-and-saving)).
3. **An invalid number.** You type 0 into query workers. The field shows its error inline, and the project keeps 64: **New** "Query workers must be at least 1." The schema's own message is "Too small: expected number to be >=1", written for developers. Escape puts back 64. **Proposed:** the field holds a draft the project never sees ([§4.3](#43-editing-and-saving)), and messages from field descriptors ([§5](#5-data-needs)).
4. **A distribution.** Query time shows its kind and its values: a kind picker (constant, exponential, lognormal) and, for lognormal, a median and a p99. You set the p99 to 10 ms, below the 15 ms median. The p99 field says **New** "The p99 must be at least the median (15 ms)." The schema's message is "p99Ms must be at least medianMs", which names the fields by their keys. Escape puts back 60. Changing the kind to constant would replace the two fields with one, "value, ms", filled in with the median, so the switch never leaves an empty field. **Proposed:** a distribution is one field kind with its own editor ([§5](#5-data-needs)).
5. **Undo.** Undo now takes query workers from 64 back to 16: one undo step per saved change. The 0 and the 10 never saved, so they aren't steps. **Proposed:** undo ([§4.3](#43-editing-and-saving)).

### 2.3 Rename a project

You copied Template A, and it's called "Serverless API with RDS", as is anything else you copy from it.

1. The project's name is the heading at the top of the project screen, with a "Rename" button beside it. You choose it; the heading becomes a text field holding the name, selected.
2. You type "Orders API" and press Enter. The heading and the breadcrumb ("Projects › Orders API") change, and the projects list shows the new name, first, since it's the most recently updated. Escape instead puts the old name back.
3. An empty name doesn't save: **New** "A project needs a name." The document schema requires one today.
4. The project still came from Template A. **Proposed:** what `source` means after editing ([§5](#5-data-needs)).

### 2.4 Add a component, and remove one

You copied Template A, and want DynamoDB where it has RDS.

1. **Add.** You add a DynamoDB table and name it "orders-table". It's placed in the diagram's spare row, under the others, as `diagramOf` does today for a component the layout doesn't place, and the drawer says "Nothing calls orders-table yet." You drag it beside fn-orders, and it stays there when you come back. **Proposed:** draggable nodes and saved positions ([§5](#5-data-needs)).
2. **Run with it unused.** The project is valid, and the lunch rush runs exactly as before: 28,841 failed. orders-table is in the Components table with 0 arrivals. [totals, from the run with orders-table added]
3. **Remove one in use.** You select orders-db and choose "Remove". Two steps and one edge use it, and the confirmation lists them: **New** "Remove orders-db? These go with it: the read in Get order, the write in Create order, and the edge from fn-orders." You confirm. The steps and the edge go, and fn-orders now calls nothing; both workflows still run, as API Gateway calling a function that answers on its own. Undo brings all four back as one step. **Proposed:** removes that cascade ([§4.3](#43-editing-and-saving)).
4. **Finish the swap.** In the step editor you add a `read` of orders-table under fn-orders in Get order, and a `write` in Create order; the first creates the `fn-orders → orders-table` edge.
5. **Remove one that would empty a workload.** Had you removed `api` instead, both workflows' first step would go, and so both workflows, since a workflow is a tree from its first step. The workloads' mixes would then be empty, which today's validation refuses ("The mix needs at least one workflow."). Wind Tunnel keeps the workloads and says they can't run: **New** "Lunch rush has no workflows to run. Add one to its mix." **Proposed:** an empty mix stops a run but not a save ([§4.3](#43-editing-and-saving)).

### 2.5 Sketch: put a queue in front of a slow component

A sketch, to test the edit model and the layout against the step editor. It doesn't run the result; Template B, which also moves reads to DynamoDB, is the nearest run ([findings §1.4](findings.md#14-template-b-lunch-rush-healthy-with-a-backlog)).

In a copy of Template A, you add an SQS queue, "orders-queue", and a Lambda, "fn-writer". In Create order's steps, you change fn-orders' `write` of orders-db into an `enqueue` to orders-queue. Only `enqueue` steps have async work ([today's rule](../../src/domain/model/validate-project.ts)), so the step editor offers an "async work" slot under it; you add a call to fn-writer there, and under it the `write` of orders-db. Three new edges appear as you go: `fn-orders → orders-queue`, `orders-queue → fn-writer`, and `fn-writer → orders-db`. The `fn-orders → orders-db` edge stays, because Get order's read still uses it.

What this tests:

- **Changing a step in place**, not removing and re-adding it, so its children survive a change of action. Only an `enqueue` takes async work, so changing one back to a `write` says that its async work goes.
- **An edge no step uses.** Had Get order's read moved too, `fn-orders → orders-db` would be used by nothing. It keeps settings the user may have set, so it stays, and the drawer says no step uses it. **Proposed** ([§4.3](#43-editing-and-saving)).
- **Room.** The step editor, the drawer, and the diagram are all in use at once, for a tree three calls deep. **Proposed** ([§3](#3-layout)).

## 3. Layout

*To write:* where the details drawer, the editors, the run controls, and the findings live, and what stays visible while editing. ASCII wireframes of the wide and narrow layouts. This settles whether the run controls move to the top bar. It also places the items punted from M5: selecting a finding highlights its component, and node status dots.

## 4. Interaction model

### 4.1 Selection

*To write:* one selected thing (a component, edge, finding, or step), held above the panels. What each panel does when the selection changes. The keyboard path, and the diagram's text version.

### 4.2 Run freshness

*To write:* what the screen says when the run on screen no longer matches the project, as in a finding that names a component since removed. Comparing a run with the one before is out of M6 ([§7](#7-not-yet)). ADR: run identity.

### 4.3 Editing and saving

*To write:* edit commands that keep the project valid (removes that cascade, a call that creates its edge), or a draft that may be invalid, with its issues inline and saving blocked until they're fixed. Then undo, and autosave or an explicit save. ADR: the edit model.

## 5. Data needs

Each row is something a journey step needs. Rows marked *open* are filled in as the journeys are written.

| Need | Today | Change | Breaking? |
|---|---|---|---|
| Labels, units, and help for each setting in a form, including how a real AWS setting maps to the model's | The config schemas validate. Their field docs are JSDoc comments, which code can't read at runtime ([`lambda.ts`](../../src/domain/components/aws/lambda.ts)) | *Open:* field descriptors registered with each component type; distributions as a field kind | No |
| Messages a user can act on for a bad value (2.2) | Config issues are Zod's messages ("Too small: expected number to be >=1"), or a schema's own, keyed by field ("p99Ms must be at least medianMs") | *Open:* messages from the field descriptors | No |
| A line on what each type is for, in "Add component" (2.1) | `displayName` only | Add a description to each definition | No |
| A new component's settings and id | `defaultConfig` on each definition; the `IdGenerator` port, which makes UUIDs | None expected for settings. See the next row for ids | No |
| Component names on screen (2.1, 2.4) | The diagram shows `name`; findings and the CLI show `id`. The templates make them equal, but a new component's id is a UUID, so a finding would read "3f2a…: throttled" | *Open:* findings show names, and names are unique in a project; or ids are made from the name when a component is added, and renaming changes only the name | *Open:* a uniqueness rule could refuse a stored project, but stored projects come only from templates, whose names are unique |
| Saving an edited project (2.2) | No use case saves an edited project. `ProjectRepository.save` stores a record as given; validation runs only when a project is opened, so an invalid save would make the project unopenable | *Open:* a use case that saves an edited project, validating it first; what it validates depends on the edit model (§4.3) | No |
| A workload that can't run yet (2.4) | An empty mix is invalid, so removing a project's last workflow would make it unsavable | *Open:* "can't run" issues, apart from "invalid" ones: they stop a run, not a save | No: it accepts more |
| Defaults for a new edge (2.1) | Edges have no defaults | *Open:* defaults, perhaps from the caller's type (API Gateway's 29 s integration timeout) | No |
| Edges: latency, timeout, retry | Every workflow call must follow an edge; no M6 item edits edges | *Open:* where edges are edited | No |
| A project with nothing in it | Projects come only from templates; `SaveProject` validates whatever it's given | *Open:* what a blank project holds, and whether it's valid | No |
| Placing a new component | `diagramOf` places a component the layout doesn't list; nodes can't be dragged | *Open:* drag, and save positions in the layout | No |
| Which project revision a run ran against | `useSimulationRun` keeps one run in memory, not tied to a revision | *Open:* run identity (§4.2) | *Open* |
| A template project after editing | `source` names the template and version | *Open:* what `source` means once the project has changed | No |

## 6. Slices

*To write:* the M6 Roadmap items re-cut from this design, each naming the sections it builds.

## 7. Not yet

*To write:* what this design leaves for later, and why. Known so far: comparing a run with the one before, and a "take this fix" control, which needs a fix to name its component, setting, and value. Both moved to the Roadmap's Not scheduled when M6 was refocused on modeling your own architecture. Also known: a Lambda throttling finding has no fix, and doesn't say when cold starts filled the concurrency (§2.1, step 10). That's the findings' work, not M6's.

## Appendix A: the link shortener

§2.1's project, as a version 1 document. To run it, save it over `src/adapters/templates/template-a.json` (its `id` stays `template-a` so the CLI finds it), run `npm run simulate -- --template template-a`, and restore the file. Step 9's run sets `burstSec` to 5; step 10's sets `concurrency` to 200.

<details>
<summary>The project document</summary>

```json
{
  "schemaVersion": 1,
  "id": "template-a",
  "name": "Link shortener",
  "createdAt": "2026-10-23T00:00:00Z",
  "updatedAt": "2026-10-23T00:00:00Z",
  "architecture": {
    "components": [
      {
        "id": "api",
        "type": "api-gateway",
        "name": "api",
        "config": {
          "ratePerSec": 10000,
          "burst": 5000,
          "overhead": { "kind": "lognormal", "medianMs": 10, "p99Ms": 25 }
        }
      },
      {
        "id": "fn-links",
        "type": "lambda",
        "name": "fn-links",
        "config": {
          "concurrency": 100,
          "coldStart": { "kind": "lognormal", "medianMs": 300, "p99Ms": 1000 },
          "idleTimeoutSec": 600,
          "computeTime": { "kind": "lognormal", "medianMs": 20, "p99Ms": 80 }
        }
      },
      {
        "id": "links",
        "type": "dynamodb",
        "name": "links",
        "config": {
          "readUnitsPerSec": 800,
          "writeUnitsPerSec": 100,
          "burstSec": 300,
          "latency": { "kind": "lognormal", "medianMs": 5, "p99Ms": 20 }
        }
      }
    ],
    "edges": [
      {
        "id": "api->fn-links",
        "from": "api",
        "to": "fn-links",
        "latencyMs": 2,
        "timeoutMs": 29000,
        "retry": { "maxAttempts": 1, "backoff": "none", "baseDelayMs": 0 }
      },
      {
        "id": "fn-links->links",
        "from": "fn-links",
        "to": "links",
        "latencyMs": 1,
        "timeoutMs": 5000,
        "retry": { "maxAttempts": 1, "backoff": "none", "baseDelayMs": 0 }
      }
    ]
  },
  "workflows": [
    {
      "id": "follow-link",
      "name": "Follow link",
      "root": {
        "componentId": "api",
        "action": "invoke",
        "calls": [
          {
            "componentId": "fn-links",
            "action": "invoke",
            "calls": [{ "componentId": "links", "action": "read" }]
          }
        ]
      }
    },
    {
      "id": "shorten",
      "name": "Shorten",
      "root": {
        "componentId": "api",
        "action": "invoke",
        "calls": [
          {
            "componentId": "fn-links",
            "action": "invoke",
            "calls": [{ "componentId": "links", "action": "write" }]
          }
        ]
      }
    }
  ],
  "workloads": [
    {
      "id": "launch",
      "name": "Launch spike",
      "durationSec": 60,
      "seed": 42,
      "mix": [
        { "workflowId": "follow-link", "weight": 95 },
        { "workflowId": "shorten", "weight": 5 }
      ],
      "profile": [
        { "atSec": 0, "requestsPerSec": 300 },
        { "atSec": 10, "requestsPerSec": 300 },
        { "atSec": 11, "requestsPerSec": 3000 },
        { "atSec": 40, "requestsPerSec": 3000 },
        { "atSec": 41, "requestsPerSec": 300 }
      ]
    }
  ],
  "layout": { "nodes": {} }
}
```

</details>
