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

Each journey goes step by step: what the user does, and what the screen shows in reply. Where a journey runs the project, the run is seed 42, from `npm run simulate`, and its numbers are quoted from the CLI's report, which shows the same verdict and findings as the run panel. Every journey's project is Template A, built or copied, so its runs are the template's, which the scenario tests keep current.

### 2.1 Model your own system

Your orders service runs on AWS: API Gateway in front of one Lambda function, `fn-orders`, which reads and writes a PostgreSQL database on RDS, `orders-db`. Most requests read an order; one in five creates one. A lunchtime promotion is coming, and you want to know if the service holds. Template A has this shape, so you could copy it ("Create from template"); this journey starts blank, to show building from nothing. Every value you enter is Template A's, so the run is Template A's lunch rush.

1. **Start.** On the projects screen, "New project" offers two choices: **New** "Create from template" (the templates, as today) and **New** "Create blank". You choose blank. A name field asks for the project's name; you type "Orders service" and press Enter. The project screen opens on an empty diagram: **New** "No components yet. Add one to start describing your system." beside an "Add component" button. The run panel says what it says today for a project without workloads: "This project has no workloads to run." **Proposed:** what a blank project holds ([§5](#5-data-needs)).
2. **Add the API.** "Add component" lists the five types, each with a line on what it's for: **New** "API Gateway: the front door; throttles requests over its rate." You choose it. A box appears on the diagram, selected, and the details drawer opens beside the diagram with the name field focused: **New** "api-gateway-1". You name it "api". Its settings show their defaults, each with its unit and help: "Rate, requests/s: 10,000. The default is the account's limit per Region, shared by every API in it ([APIGW-1](fidelity.md#apigw-1-the-throttle-limit-belongs-to-one-component-not-the-account))." You keep them. **Proposed:** the drawer ([§3](#3-layout)), the field descriptors and component names ([§5](#5-data-needs)).
3. **Add the function, translating a real setting.** You add a Lambda and name it "fn-orders". The concurrency field's help says how your function's settings map: **New** "Invocations running at once before Lambda throttles. In AWS, the function's reserved concurrency, if it has one; otherwise the account's unreserved pool, shared by every function ([LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account))." Your function has no reserved concurrency, so you keep the account's default, 1,000. The drawer says which workflow steps call the component, and there are none yet: **New** "Called by: nothing yet. A component does nothing until a workflow step calls it."
4. **Add the database: one setting from AWS, one that isn't AWS's.** You add an RDS database, "orders-db". Max connections' help: **New** "Connections the database accepts before refusing more: its `max_connections` parameter. The default depends on the engine and the instance's memory." That's **Documented** ([RDS-1](fidelity.md#rds-1-the-default-connection-limit-isnt-tied-to-an-instance-size)). Your database allows 90, and you enter it. Query workers has no AWS counterpart, and its help says so: **New** "How many queries the database runs at once, standing in for its CPU. RDS has no such setting: a larger instance class has more CPU." That's the model's assumption ([RDS-2](fidelity.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers)). You have nothing to translate, so you keep the default, 16.
5. **Connect them.** Edges are part of the architecture, like components: you draw them. You drag from api's edge handle to fn-orders, and an arrow appears. From the keyboard, the drawer's **New** "Connect to…" picker does the same. You select the new arrow to check it; the drawer shows its latency, timeout, and retry. Its timeout is 29,000 ms, a default from its caller's type, with the help "API Gateway waits up to 29 s for an integration by default" (**Documented:** [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)). You connect fn-orders to orders-db, and set that edge's timeout to your code's 5 s. **Proposed:** edge defaults ([§5](#5-data-needs)).
6. **Describe a request's path.** In the workflow editor you add "Get order": a call to api, under it a call to fn-orders, under that a `read` of orders-db. You add "Create order" the same way, ending in a `write`. Both follow the edges you drew. [§2.5](#25-describe-a-requests-path) goes through the editor step by step. fn-orders' drawer now says **New** "Called by: Get order, Create order."
7. **Set the traffic.** In the workload editor you add "Lunch rush": 60 s, seed 42, a mix of Get order 80 and Create order 20, and a profile of 200 requests a second, rising from 10 s to 2,000 at 20 s, held to 40 s, and back to 200 at 50 s. The run panel now offers it.
8. **Check the picture.** The diagram shows `api → fn-orders → orders-db`. You select Get order, and the diagram highlights the components and edges it uses. Validation finds nothing. **Proposed:** where validation shows when it does find something ([§5](#5-data-needs)).
9. **Run it.** You click Run. When it finishes:
   > **Failing.** 28,841 of 65,963 answered requests failed (43.7%); 11 were still in progress when the run ended.

   The one finding: "Failure: 28,841 requests failed with orders-db: too-many-connections, from 14 s to 47 s." You select it, and orders-db is highlighted on the diagram. **Proposed:** selection ([§4.1](#41-selection)).
10. **Read why.** The finding's note says requests waited for orders-db's query workers, holding their connections while they waited: "16 running and up to 74 waiting is 90". The setting you had nothing to translate in step 4 is the one that matters. The note's fix in Wind Tunnel is "Raise queryWorkers"; in AWS, the finding's fix is "Move to a larger DB instance class". [the finding's sentences; findings.md [§1.1](findings.md#11-template-a-lunch-rush-failing) reads this run in full] [§2.2](#22-edit-a-components-settings) goes round the loop again from here.

This journey needs every M6 slice. Steps 1 to 5 and 9 to 10 are the first slices; 6 and 7 are the workflow and workload editors.

### 2.2 Edit a component's settings

Going round the loop again, from the end of §2.1 (or from a copy of Template A, run on its lunch rush): "Failing. 28,841 of 65,963 answered requests failed (43.7%)", and the finding's note suggests "Raise queryWorkers, so queries stop waiting for a worker".

1. **Open.** You select orders-db, on the diagram or in its text version. The drawer opens with its settings: max connections 90, query workers 16, query time "lognormal, median 15 ms, p99 60 ms".
2. **A plain number.** You set query workers to 64. The change saves as you leave the field (or press Enter), and the run panel marks the run on screen as out of date: **New** "This run is of an earlier version of the project. Run again to see your changes." **Proposed:** run freshness ([§4.2](#42-run-freshness)). You run again:
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

The workflow editor, in the orders service of §2.1, after step 5: three components, two edges, no workflows. A workflow is a tree of calls: each step calls one component with one action, and makes its own calls in order while it holds that component's resources (a Lambda invocation keeps its concurrency slot while its database call runs).

1. **Find the editor.** Beside the diagram's "Add component" is a list of the project's workflows, empty: **New** "No workflows yet. A workflow is the path one kind of request takes through your architecture." beside "Add workflow". **Proposed:** where the list lives ([§3](#3-layout)).
2. **Add one.** You choose "Add workflow" and name it "Get order". The workflow opens in the drawer as an outline with one empty first step. Its component picker lists every component; you choose api. Its action picker lists only what API Gateway accepts, `invoke`, and picks it, since there's only one.
3. **Add calls.** Under the api step is **New** "Add a call from api". Its picker lists api's neighbours, the components an edge from api reaches (here fn-orders), first, and the rest after them. You choose fn-orders, `invoke`; then, under it, orders-db. RDS accepts `read` and `write`, so the action picker asks; you choose `read`. The outline reads:

   ```
   Get order                            Used by: no workload yet
   1  api · invoke
      1.1  fn-orders · invoke
           1.1.1  orders-db · read
           + Add a call from fn-orders
      + Add a call from api
   ```

   On the diagram, the three components and two edges the workflow uses are highlighted, and the text version below it lists **New** "Get order: api → fn-orders → orders-db (read)."
4. **A call with no edge.** Had you chosen a component that api has no edge to, the picker would say so beside it: **New** "No edge from api yet; choosing it adds one." Choosing it draws the edge, with its defaults. **Proposed:** a call adds its edge ([§4.3](#43-editing-and-saving)).
5. **Order matters.** You add "Create order" the same way, then remember that your code first reads the customer's record, then writes the order. Under fn-orders you add a `read`, then a `write`; Move up and Move down buttons on each step reorder siblings, from the keyboard too. fn-orders holds its slot through both calls, in that order.
6. **Remove a step.** To match Template A, you remove Create order's `read` again; it has no calls, so it goes without asking. Removing fn-orders' step instead would take its two calls with it, and asks first: **New** "Remove fn-orders · invoke and the 2 calls under it?" Undo brings back what a remove took, as one step.
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

*To write:* what this design leaves for later, and why. Known so far: comparing a run with the one before, and a "take this fix" control, which needs a fix to name its component, setting, and value. Both moved to the Roadmap's Not scheduled when M6 was refocused on modeling your own architecture.
