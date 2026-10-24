# User Experience: Modeling Your Own Architecture

Wind Tunnel exists so a developer can represent their own system and see how it behaves. Through M5, a user could only copy a template and run it, on a screen built for reading a run: the diagram on one side, and the run's verdict, findings, totals, and charts on the other. M6 ("Model my own architecture") lets the user build and change a project of their own. The templates become starting points, and the run, verdict, and findings work on whatever the user builds. This page designs the whole experience before any M6 code ([#81](https://github.com/alanbickel/wind-tunnel/issues/81)), so each new feature fits one design rather than being added to the screen on its own. ADRs record the decisions that are hard to reverse.

The method is the one [findings.md](findings.md) used. Write journeys as a user would live them ([§2](#2-journeys)). Then work out the layout ([§3](#3-layout)), the interaction model every panel shares ([§4](#4-interaction-model)), and the data each step needs ([§5](#5-data-needs)). Last, cut the work into the Roadmap's items ([§6](#6-slices)).

The build order: view and edit a component's settings, then add and remove components, start a blank project, and rename the project, then the workflow editor. The first slices are designed in depth. The later ones get just enough design that the edit model and layout won't need redoing for them.

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
3. **Add the function, translating a real setting.** You add a Lambda and name it "fn-links". Your real function has reserved concurrency 100. The concurrency field's help says how that maps: **New** "Invocations running at once before Lambda throttles. In AWS, the function's reserved concurrency, if it has one; otherwise the account's unreserved pool, shared by every function ([LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account))." You enter 100. The drawer says which workflow steps call the component, and there are none yet: **New** "Called by: nothing yet. A component does nothing until a workflow step calls it."
4. **Add the table, translating a setting that doesn't map one to one.** You add a DynamoDB table, "links". Yours is provisioned at 400 read and 100 write capacity units, and your code reads with the default, eventually consistent reads. The read units' help: **New** "Reads a second before DynamoDB throttles; each read here uses one unit. In AWS, an eventually consistent read of up to 4 KB uses half a unit, so for those, enter twice your read capacity units." That's **Documented** ([DDB-1](fidelity.md#ddb-1-every-request-costs-one-capacity-unit)). You enter 800 reads and 100 writes. Burst's help says AWS keeps up to 300 s of unused capacity but doesn't promise it ([DDB-2](fidelity.md#ddb-2-the-burst-bucket-starts-full-and-is-reliable)); you keep the default, 300. The diagram has three boxes and no arrows: nothing connects yet, and the text version under it says so.
5. **Connect them.** Edges are part of the architecture, like components: you draw them. You drag from api's edge handle to fn-links, and an arrow appears. From the keyboard, the drawer's **New** "Connect to…" picker does the same. You select the new arrow to check it; the drawer shows its latency, timeout, and retry. Its timeout is 29,000 ms, a default from its caller's type, with the help "API Gateway waits up to 29 s for an integration by default" (**Documented:** [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)). You connect fn-links to links the same way. **Proposed:** edge defaults ([§5](#5-data-needs)).
6. **Describe a request's path.** In the workflow editor you add "Follow link": a call to api, under it a call to fn-links, under that a `read` of links. You add "Shorten" the same way, ending in a `write`. Both follow the edges you drew. [§2.5](#25-describe-a-requests-path) goes through the editor step by step. fn-links' drawer now says **New** "Called by: Follow link, Shorten."
7. **Set the traffic.** In the workload editor you add "Launch spike": 60 s, seed 42, a mix of Follow link 95 and Shorten 5, and a profile of 300 requests a second for 10 s, 3,000 from 11 s to 40 s, then 300 again. The run panel now offers it.
8. **Check the picture.** The diagram shows `api → fn-links → links`. You select Follow link, and the diagram highlights the components and edges it uses. Validation finds nothing. **Proposed:** where validation shows when it does find something ([§5](#5-data-needs)).
9. **Run it.** You click Run. When it finishes:
   > **Failing.** 4,572 of 98,898 answered requests failed (4.6%); 11 were still in progress when the run ended.

   The one finding: "Failure: 4,572 requests failed with fn-links: throttled, from 10 s to 41 s." fn-links held all 100 of its concurrency in every second with these failures, and the failures stopped when the spike did. [totals: Failures; Limits `concurrency` 100 of 100] The finding names fn-links; you select it, and fn-links is highlighted on the diagram. **Proposed:** selection ([§4.1](#41-selection)).
10. **Read what the verdict doesn't say.** The Limits table shows that reads drew up to 2,762 tokens a second from `links`, against 800 provisioned, and the table still refused nothing: its 240,000-token burst (800 × 300 s) was at most 23.5% drawn. [totals: Limits `readUnits`] Your table survived the spike on saved-up capacity, which AWS doesn't promise. You select `links`, set burst to 5 s, and run again:
    > **Failing.** 58,000 of 98,898 answered requests failed (58.6%); 11 were still in progress when the run ended.

    Now the first finding is `links: throttled`, 56,888 failures, with a note that the 4,000-token bucket "lasted between 2 s and 3 s" at 2,108 tokens a second against a refill of 800. Its fix: provision read units for the sustained rate. [totals: Failures; the finding's sentences] Before the second run, while you changed burst, the run panel marked the first run as out of date: **New** "This run is of an earlier version of the project. Run again to see your changes." **Proposed:** run freshness ([§4.2](#42-run-freshness)).
11. **Undo, and fix the function.** You undo the burst change (Ctrl+Z, or the Undo button), and burst is 300 again. The run on screen is the 5 s one, so it's still marked out of date. You set fn-links' concurrency to 200 (in AWS, raising its reserved concurrency; up to 900 can be reserved, [LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account)) and run:
    > **Failing.** 13 of 98,900 answered requests failed (0.0%); 9 were still in progress when the run ended.

    All 13 failed in the second ending at 12 s, the spike's first full second, when fn-links held all 200; for the rest of the spike its concurrency peaked at 131. [the finding's sentences] fn-links cold-started 200 environments over the run [totals: Components `coldStarts`], but nothing on screen says the onset's cold starts are why it hit 200: the finding has no fix for Lambda throttling yet ([§7](#7-not-yet)).

This journey needs every M6 slice. Steps 1 to 5 and 9 to 11 are the first slices; 6 and 7 are the workflow and workload editors.

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

1. **Add.** You add a DynamoDB table and name it "orders-table". It's placed in the diagram's spare row, under the others, as `diagramOf` does today for a component the layout doesn't place, and the drawer says "Called by: nothing yet." You drag it beside fn-orders, and it stays there when you come back. You connect fn-orders to it. **Proposed:** draggable nodes and saved positions ([§5](#5-data-needs)).
2. **Run with it unused.** The project is valid, and the lunch rush runs exactly as before: 28,841 failed. orders-table is in the Components table with 0 arrivals. [totals, from the run with orders-table added]
3. **Move the calls.** In the workflow editor, you select Get order's `read` of orders-db and change its component to orders-table; the step keeps its place and its action. You do the same for Create order's `write`. orders-db's drawer now says "Called by: nothing yet", and its edge from fn-orders is still drawn: edges belong to the architecture, so moving a call doesn't remove one.
4. **Remove it.** You select orders-db and choose "Remove". A remove takes the component and its own edges, nothing in the workflows: **New** "Remove orders-db and its edge from fn-orders?" You confirm, and both go. Undo brings both back as one step.
5. **Remove one that's still called.** Had you removed orders-db before step 3, the confirmation would have warned: **New** "Remove orders-db and its edge from fn-orders? 2 workflow steps call it, and won't run until you change them." The steps would stay, each marked **New** "orders-db isn't in the architecture any more." The project still saves, but the run panel says **New** "Lunch rush can't run yet: Get order and Create order call orders-db, which isn't in the architecture." Step 3 fixes it: point the steps at orders-table. **Proposed:** architecture issues stop a save; workflow issues stop a run ([§4.3](#43-editing-and-saving)).

### 2.5 Describe a request's path

The workflow editor, in the link shortener of §2.1, after step 5: three components, two edges, no workflows. A workflow is a tree of calls: each step calls one component with one action, and makes its own calls in order while it holds that component's resources (a Lambda invocation keeps its concurrency slot while its database call runs).

1. **Find the editor.** Beside the diagram's "Add component" is a list of the project's workflows, empty: **New** "No workflows yet. A workflow is the path one kind of request takes through your architecture." beside "Add workflow". **Proposed:** where the list lives ([§3](#3-layout)).
2. **Add one.** You choose "Add workflow" and name it "Follow link". The workflow opens in the drawer as an outline with one empty first step. Its component picker lists every component; you choose api. Its action picker lists only what API Gateway accepts, `invoke`, and picks it, since there's only one.
3. **Add calls.** Under the api step is **New** "Add a call from api". Its picker lists api's neighbours, the components an edge from api reaches (here fn-links), first, and the rest after them. You choose fn-links, `invoke`; then, under it, links. DynamoDB accepts `read` and `write`, so the action picker asks; you choose `read`. The outline reads:

   ```
   Follow link                          Used by: no workload yet
   1  api · invoke
      1.1  fn-links · invoke
           1.1.1  links · read
           + Add a call from fn-links
      + Add a call from api
   ```

   On the diagram, the three components and two edges the workflow uses are highlighted, and the text version below it lists **New** "Follow link: api → fn-links → links (read)."
4. **A call with no edge.** Had you chosen a component that api has no edge to, the picker would say so beside it: **New** "No edge from api yet; choosing it adds one." Choosing it draws the edge, with its defaults. **Proposed:** a call adds its edge ([§4.3](#43-editing-and-saving)).
5. **Order matters.** You add "Shorten" the same way, then decide your code first reads links to check that the short code is free, then writes it. Under fn-links you add a `read`, then a `write`; Move up and Move down buttons on each step reorder siblings, from the keyboard too. fn-links holds its slot through both calls, in that order.
6. **Remove a step.** You remove Shorten's `read` again; it has no calls, so it goes without asking. Removing fn-links' step instead would take its two calls with it, and asks first: **New** "Remove fn-links · invoke and the 2 calls under it?" Undo brings back what a remove took, as one step.
7. **A step that can't run.** A step whose component isn't in the architecture, or whose call has no edge, shows its issue on the step (§2.4, step 5). Its workflow can't run, and nor can the workloads that use it; the rest of the project can.
8. **Async work.** Only an `enqueue` step gets **New** "Async work, done when a consumer takes the message" under it, a second tree that starts when the message is delivered. [§2.6](#26-sketch-put-a-queue-in-front-of-a-slow-component) uses it.

Each change saves as it's made, like a setting (§2.2).

### 2.6 Sketch: put a queue in front of a slow component

A sketch, to test the edit model and the layout against the workflow editor. It doesn't run the result; Template B, which also moves reads to DynamoDB, is the nearest run ([findings §1.4](findings.md#14-template-b-lunch-rush-healthy-with-a-backlog)).

In a copy of Template A, you add an SQS queue, "orders-queue", and a Lambda, "fn-writer". In Create order's steps, you change fn-orders' `write` of orders-db into an `enqueue` to orders-queue. Only `enqueue` steps have async work ([today's rule](../../src/domain/model/validate-project.ts)), so the workflow editor offers an "async work" slot under it; you add a call to fn-writer there, and under it the `write` of orders-db. You didn't draw the three edges these calls need, so each call adds its own as you go: `fn-orders → orders-queue`, `orders-queue → fn-writer`, and `fn-writer → orders-db`. The `fn-orders → orders-db` edge stays, and Get order's read still uses it.

What this tests:

- **Changing a step in place**, not removing and re-adding it, so its children survive a change of action. Only an `enqueue` takes async work, so changing one back to a `write` says that its async work goes.
- **An edge no step uses.** Had Get order's read moved too, `fn-orders → orders-db` would be used by nothing. It's part of the architecture, so it stays, and its drawer says no step uses it.
- **Room.** The workflow editor, the drawer, and the diagram are all in use at once, for a tree three calls deep. **Proposed** ([§3](#3-layout)).

## 3. Layout

*To write:* where the details drawer, the editors, the run controls, and the findings live, and what stays visible while editing. ASCII wireframes of the wide and narrow layouts. This settles whether the run controls move to the top bar. It also places the items punted from M5: selecting a finding highlights its component, and node status dots.

## 4. Interaction model

### 4.1 Selection

*To write:* one selected thing (a component, edge, finding, or step), held above the panels. What each panel does when the selection changes. The keyboard path, and the diagram's text version.

### 4.2 Run freshness

*To write:* what the screen says when the run on screen no longer matches the project, as in a finding that names a component since removed. Comparing a run with the one before is out of M6 ([§7](#7-not-yet)). ADR: run identity.

### 4.3 Editing and saving

Agreed with the maintainer (2026-10-24), to be worked out here and recorded in the edit model's ADR:

- **Validate, then save at once.** Each change is validated and saved as it's made; there's no Save button. A value that fails validation stays in its field, with its message, and never reaches the stored project (§2.2).
- **The architecture and the workflows are validated apart.** The architecture (components, their settings, edges) must always be valid, or the change doesn't save. Workflows and workloads may have issues, such as a step that calls a removed component or a workload with an empty mix. Those issues show where they are, stop a run of the workloads they affect, and don't stop a save (§2.4, §2.5).
- **A remove takes only what it owns.** Removing a component removes it and its own edges, never workflow steps; the confirmation names the steps that call it (§2.4). Removing a step removes the calls under it, and its async work (§2.5).
- **Edges belong to the architecture.** They're drawn, edited, and removed on their own, and shown whether or not a step uses them. A call along a missing edge adds the edge, as a shortcut (§2.1, §2.5).

*To write:* undo (one step per saved change, a remove and what it took as one step); what a field's draft is; where the issues show; the ADR.

## 5. Data needs

Each row is something a journey step needs. Rows marked *open* are filled in as the journeys are written.

| Need | Today | Change | Breaking? |
|---|---|---|---|
| Labels, units, and help for each setting in a form, including how a real AWS setting maps to the model's | The config schemas validate. Their field docs are JSDoc comments, which code can't read at runtime ([`lambda.ts`](../../src/domain/components/aws/lambda.ts)) | *Open:* field descriptors registered with each component type; distributions as a field kind | No |
| Messages a user can act on for a bad value (2.2) | Config issues are Zod's messages ("Too small: expected number to be >=1"), or a schema's own, keyed by field ("p99Ms must be at least medianMs") | *Open:* messages from the field descriptors | No |
| A line on what each type is for, in "Add component" (2.1) | `displayName` only | Add a description to each definition | No |
| A new component's settings and id | `defaultConfig` on each definition; the `IdGenerator` port, which makes UUIDs | None expected for settings. See the next row for ids | No |
| Component names on screen (2.1, 2.4) | The diagram shows `name`; findings and the CLI show `id`. The templates make them equal, but a new component's id is a UUID, so a finding would read "3f2a…: throttled" | *Open:* findings show names, and names are unique in a project; or ids are made from the name when a component is added, and renaming changes only the name | *Open:* a uniqueness rule could refuse a stored project, but stored projects come only from templates, whose names are unique |
| Saving an edited project (2.2) | No use case saves an edited project. `ProjectRepository.save` stores a record as given; validation runs only when a project is opened, so an invalid save would make the project unopenable | A use case that validates the architecture, then saves (§4.3) | No |
| Workflow and workload issues that stop a run, not a save (2.4, 2.5) | `findProjectIssues` checks everything as one, and opening a project refuses it if anything fails, a step's missing edge included | Split the checks: architecture issues refuse a save; workflow and workload issues are kept with the project, shown where they are, and stop a run of the workloads they affect. Opening a project accepts the second kind | No: it accepts more |
| Drawing and editing edges (2.1) | Edges come only from templates, and nothing edits them | Connect on the diagram, and a keyboard way ("Connect to…"); an edge's settings in the drawer; remove an edge | No |
| Defaults for a new edge (2.1) | Edges have no defaults | *Open:* defaults, perhaps from the caller's type (API Gateway's 29 s integration timeout) | No |
| What calls a component (2.1, 2.4) | Nothing works it out | "Called by", from the workflows' steps | No |
| A workflow's path on the diagram (2.1, 2.5) | `diagramOf` knows nothing of workflows | The components and edges a workflow uses, to highlight, and a line for the text version | No |
| A project with nothing in it | Projects come only from templates | *Open:* what a blank project holds, and whether it's valid | No |
| Placing a new component | `diagramOf` places a component the layout doesn't list; nodes can't be dragged | *Open:* drag, and save positions in the layout | No |
| Which project revision a run ran against | `useSimulationRun` keeps one run in memory, not tied to a revision | *Open:* run identity (§4.2) | *Open* |
| A template project after editing | `source` names the template and version | *Open:* what `source` means once the project has changed | No |

## 6. Slices

*To write:* the M6 Roadmap items re-cut from this design, each naming the sections it builds.

## 7. Not yet

*To write:* what this design leaves for later, and why. Known so far: comparing a run with the one before, and a "take this fix" control, which needs a fix to name its component, setting, and value. Both moved to the Roadmap's Not scheduled when M6 was refocused on modeling your own architecture. Also known: a Lambda throttling finding has no fix, and doesn't say when cold starts filled the concurrency (§2.1, step 11). That's the findings' work, not M6's.

## Appendix A: the link shortener

§2.1's project, as a version 1 document. To run it, save it over `src/adapters/templates/template-a.json` (its `id` stays `template-a` so the CLI finds it), run `npm run simulate -- --template template-a`, and restore the file. Step 10's second run sets `burstSec` to 5; step 11's sets `concurrency` to 200.

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
