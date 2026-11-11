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

Each journey goes step by step: what the user does, and what the screen shows in reply. Where a journey runs the project, the run is seed 42, and its numbers are quoted from the CLI's report, which shows the same verdict and findings as the run panel. Template A's own runs are from `npm run simulate`, and the scenario tests keep them current. Two runs are of a copy of Template A with one edit: query workers set to 64 (§2.2 step 2), and orders-table added (§2.4 step 2). The CLI runs only templates, so these came from a one-off script that edits the copy and prints the CLI's report for it; no test keeps their numbers current.

### 2.1 Model your own system

Your orders service runs on AWS: API Gateway in front of one Lambda function, `fn-orders`, which reads and writes a PostgreSQL database on RDS, `orders-db`. Most requests read an order; one in five creates one. A lunchtime promotion is coming, and you want to know if the service holds. Template A has this shape, so you could copy it ("Create from template"); this journey starts blank, to show building from nothing. Every value you enter is Template A's. The run below is Template A's; a project built this way fails the same way, with slightly different counts.

1. **Start.** On the projects screen, "New project" offers two choices: **New** "Create from template" (the templates, as today) and **New** "Create blank". You choose blank. A name field asks for the project's name; you type "Orders service" and press Enter. The project screen opens on an empty diagram: **New** "No components yet. Add one to start describing your system." beside an "Add component" button. The run panel says what it says today for a project without workloads: "This project has no workloads to run." **Proposed:** what a blank project holds ([§5](#5-data-needs)).
2. **Add the API.** "Add component" lists the five types, each with a line on what it's for: **New** "API Gateway: the front door; throttles requests over its rate." You choose it. A box appears on the diagram, selected, and the details drawer opens beside the diagram with the name field focused: **New** "api-gateway-1". You name it "api". Its settings show their defaults, each with its unit and help: "Rate, requests/s: 10,000. The default is the account's limit per Region, shared by every API in it ([APIGW-1](fidelity.md#apigw-1-the-throttle-limit-belongs-to-one-component-not-the-account))." You keep them. **Proposed:** the drawer ([§3](#3-layout)), the field descriptors and component names ([§5](#5-data-needs)).
3. **Add the function, translating a real setting.** You add a Lambda and name it "fn-orders". The concurrency field's help says how your function's settings map: **New** "Invocations running at once before Lambda throttles. In AWS, the function's reserved concurrency, if it has one; otherwise the account's unreserved pool, shared by every function ([LMB-1](fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account))." Your function has no reserved concurrency, so you keep the account's default, 1,000. The drawer says which workflow steps call the component, and there are none yet: **New** "Called by: nothing yet. A component does nothing until a workflow step calls it."
4. **Add the database: one setting from AWS, one that isn't AWS's.** You add an RDS database, "orders-db". Max connections' help: **New** "Connections the database accepts before refusing more: its `max_connections` parameter. The default depends on the engine and the instance's memory." That's **Documented** ([RDS-1](fidelity.md#rds-1-the-default-connection-limit-isnt-tied-to-an-instance-size)). Your database allows 90, which happens to be the default, so you keep it. Query workers has no AWS counterpart, and its help says so: **New** "How many queries the database runs at once, standing in for its CPU. RDS has no such setting: a larger instance class has more CPU." That's the model's assumption ([RDS-2](fidelity.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers)). Each setting's help ends with its default and how sure that default is, here **New** "Default 16: an assumption (RDS-2)." You have nothing to translate, so you keep it.
5. **Connect them.** Edges are part of the architecture, like components: you draw them. You drag from api's edge handle to fn-orders, and an arrow appears. From the keyboard, the drawer's **New** "Connect to…" picker does the same. You select the new arrow to check it; the drawer shows its latency, timeout, and retry. Its timeout is 29,000 ms, a default from its caller's type, with the help "API Gateway waits up to 29 s for an integration by default" (**Documented:** [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)). You connect fn-orders to orders-db, and set that edge's timeout to your code's 5 s. **Proposed:** edge defaults ([§5](#5-data-needs)).
6. **Describe a request's path.** In the workflow editor you add "Get order": a call to api, under it a call to fn-orders, under that a `read` of orders-db. You add "Create order" the same way, ending in a `write`. Both follow the edges you drew. [§2.5](#25-describe-a-requests-path) goes through the editor step by step. fn-orders' drawer now says **New** "Called by: Get order, Create order."
7. **Set the traffic.** In the workload editor you add "Lunch rush": 60 s, seed 42, a mix of Get order 80 and Create order 20, and a profile of 200 requests a second, rising from 10 s to 2,000 at 20 s, held to 40 s, and back to 200 at 50 s. The run panel now offers it. [§2.7](#27-describe-the-traffic) goes through the editor step by step.
8. **Check the picture.** The diagram shows `api → fn-orders → orders-db`. You select Get order, and the diagram highlights the components and edges it uses. Validation finds nothing. **Proposed:** where validation shows when it does find something ([§4.3](#43-editing-and-saving)).
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

You copied Template A, and it's called "Serverless API with RDS". A second copy would be "Serverless API with RDS (2)", since no two projects share a name.

1. The project's name is the heading at the top of the project screen, with a "Rename" button beside it. You choose it; the heading becomes a text field holding the name, selected.
2. You type "Orders API" and press Enter. The heading and the breadcrumb ("Projects › Orders API") change, and the projects list shows the new name, first, since it's the most recently updated. Escape instead puts the old name back.
3. An empty name doesn't save: **New** "A project needs a name." The document schema requires one today. Nor does a name another project uses, compared without the spaces around it and ignoring case: **New** "Another project already uses this name. Please choose another name." The project's own name, in another case, is fine. **Proposed:** unique project names ([§5](#5-data-needs)).
4. The project still came from Template A. **Proposed:** what `source` means after editing ([§5](#5-data-needs)).

### 2.4 Add a component, and remove one

You copied Template A, and want DynamoDB where it has RDS.

1. **Add.** You add a DynamoDB table and name it "orders-table". It's placed in the diagram's spare row, under the others, as `diagramOf` does today for a component the layout doesn't place, and the drawer says "Called by: nothing yet." You drag it beside fn-orders, and it stays there when you come back. You connect fn-orders to it. **Proposed:** draggable nodes and saved positions ([§5](#5-data-needs)).
2. **Run with it unused.** The project is valid, and the lunch rush runs exactly as before: 28,841 failed. orders-table is in the Components table with 0 arrivals. [totals, from the run with orders-table added]
3. **Move the calls.** In the workflow editor, you select Get order's `read` of orders-db and change its component to orders-table; the step keeps its place and its action. You do the same for Create order's `write`. orders-db's drawer now says "Called by: nothing yet", and its edge from fn-orders is still drawn: edges belong to the architecture, so moving a call doesn't remove one.
4. **Remove it.** You select orders-db and choose "Remove". A remove takes the component and its own edges, nothing in the workflows: **New** "Remove orders-db and its edge from fn-orders?" You confirm, and both go. Undo brings both back as one step.
5. **Remove one that's still called.** Had you removed orders-db before step 3, the confirmation would have warned: **New** "Remove orders-db and its edge from fn-orders? 2 workflow steps call it, and won't run until you change them." The steps would stay, each marked **New** "This step calls a component that isn't in the architecture any more." The project still saves, but the run panel says **New** "Lunch rush can't run yet: Get order and Create order call a component that isn't in the architecture any more." Neither names orders-db: after a remove, a step holds only the component's id, which is never shown, and keeping removed names would add to the stored project for a message the step's place in the workflow editor already explains (decided in [#95](https://github.com/alanbickel/wind-tunnel/issues/95)). Step 3 fixes it: point the steps at orders-table. **Proposed:** architecture issues stop a save; workflow issues stop a run ([§4.3](#43-editing-and-saving)).

### 2.5 Describe a request's path

The workflow editor, in the orders service of §2.1, after step 5: three components, two edges, no workflows. A workflow is a tree of calls: each step calls one component with one action, and makes its own calls in order while it holds that component's resources (a Lambda invocation keeps its concurrency slot while its database call runs).

1. **Find the editor.** Beside the diagram's "Add component" is a list of the project's workflows, empty: **New** "No workflows yet. A workflow is the path one kind of request takes through your architecture." beside "Add workflow". **Proposed:** where the list lives ([§3](#3-layout)).
2. **Add one.** You choose "Add workflow" and name it "Get order". Workflow names are unique, compared without the spaces around them and ignoring case, as project names are: **New** "A workflow needs a name." and "Another workflow already uses this name. Please choose another name." A workflow's own name, in another case, is fine, and a rename uses the same check. The new workflow opens in the drawer as a draft, with the name field holding the first free name ("workflow-1"), selected, and an outline with one empty first step. Its component picker lists every component; you choose api. Its action picker lists only what API Gateway accepts, `invoke`, and picks it, since there's only one. **New** A workflow is stored with a root step, so nothing saves until the name passes its check and the first step has a component and an action: then it saves, selected, as one undo step, "Add workflow Get order". Escape, or selecting something else, drops the draft: nothing saves, and there's no undo step. With no components, "Add workflow" is unusable and says **New** "Add a component first."
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

In a copy of Template A, you add an SQS queue, "orders-queue", and a Lambda, "fn-writer". In Create order's steps, you change fn-orders' `write` of orders-db into an `enqueue` to orders-queue. Only `enqueue` steps have async work ([today's rule](../../src/domain/components/find-step-issues.ts)), so the workflow editor offers an "async work" slot under it; you add a call to fn-writer there, and under it the `write` of orders-db. You didn't draw the three edges these calls need, so each call adds its own as you go: `fn-orders → orders-queue`, `orders-queue → fn-writer`, and `fn-writer → orders-db`. The `fn-orders → orders-db` edge stays, and Get order's read still uses it.

The steps, as the editor will offer them ([ADR-0021](../adr/0021-edit-async-work-through-the-same-commands.md) is the design behind them):

1. **Change the step.** You select fn-orders' `orders-db · write`, and in its pickers choose `orders-queue`; SQS accepts only `enqueue`, so the action follows. The step keeps its place, and the edge `fn-orders → orders-queue` is added with it: **New** "Changed orders-db · write to orders-queue · enqueue. Added the edge from fn-orders to orders-queue. It has no async work yet."
2. **Fill the slot.** Under the step the outline says **New** "No async work yet. A message is taken off the queue and nothing runs." beside **New** "Add async work, done when a consumer takes the message". You choose `fn-writer`, marked "No edge from orders-queue yet; choosing it adds one.", and `invoke`: **New** "Added async work from orders-queue to fn-writer. Added the edge from orders-queue to fn-writer."
3. **Add the write.** Under fn-writer, "Add a call from fn-writer", `orders-db`, `write`, adds `fn-writer → orders-db`.
4. **Undo** takes back one of these at a time, each with its edge.
5. **Change it back.** Had you changed the `enqueue` back to a `write` of orders-db, the screen would ask: **New** "Change orders-queue · enqueue to orders-db · write? The 2 steps under it go." Cancel has the focus; confirming takes them, and one Undo brings back both them and the `enqueue`.

What this tests:

- **Changing a step in place**, not removing and re-adding it, so it keeps its id, its place and its selection, while what's under it goes after a confirmation. Only an `enqueue` takes async work, so changing one back to a `write` says that its async work goes.
- **An edge no step uses.** Had Get order's read moved too, `fn-orders → orders-db` would be used by nothing. It's part of the architecture, so it stays, and its drawer says no step uses it.
- **Room.** The workflow editor, the drawer, and the diagram are all in use at once, for a tree three calls deep. **Proposed** ([§3](#3-layout)).

### 2.7 Describe the traffic

The workload editor, in the orders service of §2.1, after step 6: two workflows, Get order and Create order, and no workloads. A workload says how much traffic the workflows get, and for how long: a duration, a seed, a mix of workflows, and a profile of request rates over time. This journey builds §2.1 step 7's "Lunch rush". It is an example: nothing in the editor knows about it, and a workload with one workflow, a flat profile, or a point at the very end of the run is edited the same way.

1. **Find the editor.** Under the workflows in the left column is a list of the project's workloads, empty: **New** "No workloads yet. A workload says how much traffic your workflows get, and for how long." beside "Add workload". The project bar says what it says today for a project without workloads: "This project has no workloads to run." **Proposed:** where the list lives ([§3](#3-layout)).
2. **Add one.** You choose "Add workload". It saves at once, since a workload has a valid shape from the start, and opens in the drawer with its name field focused and selected, holding the first free name: **New** "workload-1". It starts with 60 s, seed 42, an empty mix, and a profile of one point, 100 requests/s from 0 s. The project bar now offers it, picked, and says why it can't run, announced politely: **New** "workload-1 can't run yet: The mix has no workflows." Each of those values is an editor default, chosen to give something that runs once a workflow is in the mix, and to be edited. **Proposed:** a new workload's defaults ([§5](#5-data-needs)).
3. **Name it.** You type "Lunch rush" and press Enter. Workload names are unique, compared as workflow names are, without the spaces around them and ignoring case: **New** "A workload needs a name." and "Another workload already uses this name. Please choose another name." The picker needs names to tell them apart.
4. **Duration and seed.** Duration is a number of seconds: **New** "Duration, s: 60. How long requests keep arriving, in simulated seconds. The run stops at this time, and requests still in progress then are reported as such." You keep it. Seed is a whole number: **New** "Seed: 42. The same seed gives the same run: when requests arrive, which workflow each one is, and how long each step takes. Change it to see how much a result depends on luck." You keep it too. A seed outside 0 to 4,294,967,295 shows **New** "Seed must be a whole number from 0 to 4,294,967,295." and the workload keeps its seed.
5. **Build the mix.** The mix is empty: **New** "No workflows in the mix. A workload with an empty mix can't run." beside "Add to mix", a picker of the workflows not yet in it. You choose Get order. A row appears: its name, a weight field holding 1, its share, **New** "100%", and "Remove from mix". You set the weight to 80, then add Create order, which arrives with weight 1:

   ```
   Mix                                         Shares total 100%
   Get order      weight [ 80 ]    98.8%       [Remove from mix]
   Create order   weight [  1 ]     1.2%       [Remove from mix]
   [Add to mix ▾]
   ```

   You set its weight to 20, and the shares read 80% and 20%. Shares are weight ÷ the sum of the weights, to a tenth of a percent, and the last digit is shared out so they always add to exactly 100%; a mix of three equal weights reads 33.4%, 33.3%, and 33.3%. Weights are relative, and the field's help says so: **New** "How often this workflow runs compared with the others in the mix. Weights are relative: 80 and 20 mean four requests in five are this workflow's." With every workflow in the mix, "Add to mix" is unusable and says **New** "Every workflow is already in the mix." With none to add, **New** "Add a workflow first." **Proposed:** the mix ([§5](#5-data-needs)).
6. **Draw the profile.** The profile is a table of points, with a read-only chart of it above. It starts with one row, 0 s at 100 requests/s; you set the rate to 200. "Add point" appends a row 10 s after the last, at the last's rate: 10 s at 200. Add another, 20 s at 200, and set its rate to 2,000; another, 30 s at 2,000, and set its time to 40; and another, 50 s at 2,000, with its rate set to 200. The table reads:

   ```
   Time (s)   Rate (requests/s)
   [  0 ]     [   200 ]          [Remove]
   [ 10 ]     [   200 ]          [Remove]
   [ 20 ]     [ 2,000 ]          [Remove]
   [ 40 ]     [ 2,000 ]          [Remove]
   [ 50 ]     [   200 ]          [Remove]
   [Add point]
   ```

   The chart draws the target rate as the engine reads it: a straight line between points, level before the first and after the last. Lunch rush's last point is at 50 s and the run is 60 s, so the chart shows the rate holding at 200 from 50 s to the end, and marks where the run ends: **New** "Run ends at 60 s". The chart is a picture of the table, labeled "Request rate over time", and the table is the version a screen reader reads. A time field's range is between its neighbours': typing 15 over the 20 s row shows **New** "Time must be after 10 s and before 40 s." and keeps 20, so a profile made on screen is always in order, as a p99 is always at least its median (§2.2). Escape puts the saved value back. The only point's "Remove" is unusable and says **New** "A profile needs at least one point." **Proposed:** profile editing ([§5](#5-data-needs)).
7. **A point past the run's end.** You shorten the duration to 45 s. The 50 s row says **New** "After the run's end (45 s). Arrivals follow the line toward this point, and the run stops at 45 s." and the chart draws it muted, beyond the "Run ends at 45 s" marker. The workload can still run. The engine reads the profile only up to the duration, so a point beyond it isn't an error: it shapes the line before the end, and a user may want to try the first part of a long profile. You undo it.
8. **Check and run.** The list row says nothing about problems, the project bar offers Lunch rush, and Run works. It runs as §2.1 step 9 does.
9. **Undo.** Undo takes back one saved change at a time and says which: "Undo change Lunch rush's rate at 50 s to 200 requests/s". [§2.7's table of commands](#the-commands) lists every step's name.
10. **Remove a workflow that's in the mix.** In the workflow editor you remove Get order. Its confirmation names the workloads it leaves: "Lunch rush runs it; it leaves its mix." Afterwards Lunch rush's mix is Create order alone at 100%, and it runs. Removing Create order as well leaves the mix empty: the mix section says **New** "No workflows in the mix. A workload with an empty mix can't run.", the list row says "1 problem", and the project bar says "Lunch rush can't run yet: The mix has no workflows." Undo brings both workflows back, with their entries in the mix at their weights (§4.3).
11. **Remove the workload.** You select Lunch rush's row and choose "Remove". **New** "Remove Lunch rush?" You confirm, and it goes; the focus moves to "Add workload", and **New** "Removed Lunch rush." is announced from a polite region beside that button (§4.4). The project bar picks the workload that came after it in the list, or the one before if it was last, or says "This project has no workloads to run." if none is left. A run of Lunch rush that's on screen stays as it was, marked out of date, since the workload it ran is gone (§4.2). Undo brings Lunch rush back whole, with its mix and profile, and selects it.

What this tests:

- **No dependence on one example.** Every step works for a workload shaped differently: one workflow, a flat profile, a last point exactly at the duration, a weight that leaves a share too small to see at a tenth of a percent.
- **A model with no draft.** A new workload is complete the moment it exists, so unlike a workflow (§2.5 step 2) it never needs a draft state, and "Add workload" is one undo step.
- **Issues that don't stop a save.** An empty mix is saved and stops only a run (§4.3).

#### The commands

Each is a pure function in `application/edits/workload-edits.ts`, one undo step, and returns the record unchanged for a workload the project doesn't have, or for a change that changes nothing. `describe` is the step's name: Undo shows it after "Undo", with its first letter lowercased unless it's a name ([§4.3](#43-editing-and-saving)).

| Command | Step's name | Announced |
|---|---|---|
| `addWorkload` | "Add workload workload-1" | The project bar's "can't run yet" message, as the empty mix stops it (it's a status region already) |
| `renameWorkload` | "Rename workload-1 to Lunch rush" | |
| `removeWorkload` | "Remove workload Lunch rush" | "Removed Lunch rush." |
| `setWorkloadDuration` | "Change Lunch rush's duration to 45 s" | |
| `setWorkloadSeed` | "Change Lunch rush's seed to 7" | |
| `addToMix` | "Add Get order to Lunch rush's mix" | |
| `setMixWeight` | "Change Get order's weight in Lunch rush to 80" | |
| `removeFromMix` | "Remove Get order from Lunch rush's mix" | |
| `addProfilePoint` | "Add a point at 10 s to Lunch rush's profile" | |
| `setProfilePoint` | "Change Lunch rush's rate at 50 s to 200 requests/s", or "Change Lunch rush's point at 50 s to 55 s" | |
| `removeProfilePoint` | "Remove the point at 50 s from Lunch rush's profile" | |

Everything the table doesn't announce is what the user just did, and the field shows it (§4.4). Where an issue a command makes shows is [§4.3](#43-editing-and-saving).

## 3. Layout

The loop needs three things in reach at once: the picture (the diagram), the thing being changed (the drawer), and whether the project still holds up (Run, and the verdict). Today's screen has two columns from the `--breakpoint-wide` width up, the architecture and the run panel, and stacks them below it ([UI guide, Layout](../architecture/user-interface.md#patterns-youll-see)). This design keeps the two columns and adds a project bar above them.

### 3.1 Wide

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Wind Tunnel    Projects › Orders service                              Theme ▾ │ top bar, as today
├───────────────────────────────────────────────────────────────────────────────┤
│ Orders service  [Rename]  [Undo] [Redo]       Workload [Lunch rush ▾] [Edit]  │ project bar
│                                               [Run]  Failing: 28,841 of 65,963│
│                                               failed (43.7%). Out of date.    │
├─────────────────────────────────────────┬─────────────────────────────────────┤
│ Architecture           [Add component]  │  Details │ Run                      │
│ ┌─────────────────────────────────────┐ │ ────────                            │
│ │                                     │ │ orders-db · RDS            [Remove] │
│ │ [api] ─▶ [fn-orders] ─▶ [orders-db]●│ │ Name             [orders-db     ]   │
│ │                                     │ │ Max connections  [90            ]   │
│ │                                     │ │   The database's max_connections…   │
│ └─────────────────────────────────────┘ │ Query workers    [64            ]   │
│ ▸ Components, connections, and paths as │ Query time  [lognormal ▾]           │
│   text                                  │   median [15] ms   p99 [60] ms      │
│ Workflows                [Add workflow] │ Called by: Get order, Create order  │
│   Get order   Create order              │ [Connect to… ▾]                     │
│ Workloads                [Add workload] │                                     │
│   Lunch rush   Steady day   Long rush   │                                     │
└─────────────────────────────────────────┴─────────────────────────────────────┘
```

- **The project bar** spans the screen under the top bar, and stays while the columns scroll. It holds the project's name and Rename (§2.3), Undo and Redo, the workload picker with Edit (which opens the workload in the drawer), Run and Stop, and the run's status: progress while it runs, then the verdict's first sentence, and "Out of date" once the project changes (§4.2). This settles TODO look-and-feel item 5: the run controls leave the run panel, but for the project bar, not the app's top bar, which is the same on every screen and has nothing to run on the projects list. The project's description stays under its name.
- **The left column is the model.** The diagram fills it, with "Add component" above it and the text version below it, as today. Under those, the workflows and workloads, one line each with an Add button: selecting one opens it in the drawer (§2.5). The diagram shows the selection, a workflow's path (§2.5, step 3), and after a run each component's status dot.
- **The workloads list** sits under the workflows, in the left column of the wide layout and in the one column of the narrow one (§3.2), and is built like the workflows list: a row per workload, its name, **New** "1 problem" if it has issues (§4.3), and "Add workload" above it. A row selects the workload and opens it in the drawer (§2.7). **How the project bar's Edit relates to the list** ([§2.7](#27-describe-the-traffic)): the bar's picker says which workload Run runs; the list says which one Details shows. They can differ, but the one-way links keep Run from running what you aren't looking at: selecting a row, or adding a workload, also picks it in the bar; picking in the bar changes only the bar; and Edit selects the picked workload, as a click on its row would. Removing the picked workload picks the next (§2.7 step 11).
- **The right column holds the drawer and the run's results, as two tabs: Details and Run.** Selecting anything opens Details; Run, or Escape in the drawer, shows the run again. Run holds what the run panel shows under its controls today: the findings, then the totals, then the charts.
- **What stays visible while editing:** the project bar (the verdict, whether it's out of date, Run, Undo), the diagram, and the lists. The findings, totals, and charts are one tab away. A finding's "fix" names a setting the user then opens in Details, so the two are seen in turn, not side by side; [§7](#7-not-yet) has a third column for windows wide enough.

### 3.2 Narrow

Below `--breakpoint-wide`, one column, and the page scrolls, as today:

```
┌──────────────────────────────────┐
│ Wind Tunnel  Projects › Orders…▾ │ top bar
├──────────────────────────────────┤
│ Orders service  [Rename]         │ project bar,
│ [Undo] [Redo]                    │ wrapped
│ Workload [Lunch rush ▾] [Edit]   │
│ [Run]  Failing: 28,841 of 65,963 │
│ failed (43.7%). Out of date.     │
├──────────────────────────────────┤
│ Architecture     [Add component] │
│ ┌──────────────────────────────┐ │
│ │ [api] → [fn-orders] → [db]●  │ │
│ └──────────────────────────────┘ │
│ ▸ Components and connections…    │
│ Workflows / Workloads            │
├──────────────────────────────────┤
│ Details: orders-db       [Close] │ only while something
│ …                                │ is selected
├──────────────────────────────────┤
│ Run: findings, totals, charts    │
└──────────────────────────────────┘
```

The project bar wraps and doesn't stick, so it doesn't take a small screen's height. Details appears under the model only while something is selected, and selecting moves the focus to its heading, so the keyboard and a screen reader land on it (§4.1). There are no tabs: the run's results follow, as the run panel does today.

### 3.3 The items punted from M5

- **Selecting a finding highlights its component.** In the wide layout the diagram stays in view while the Run tab shows the findings, so the highlight is seen as it's made; the charts are in the same tab, so shading a finding's windows on them needs no more room. How selection works is §4.1.
- **Node status dots** go on the diagram's node cards, from the run on screen: one dot per component, telling apart a component that refused work, one whose limits made work wait, and one with neither. Each status has its own shape as well as its color, and the text version lists it. Once the run is out of date the dots are drawn hollow, and the text version says they're from an earlier version (§4.2). The card's look is TODO look-and-feel item 6, out of this design; the dot needs only a place on the card.

## 4. Interaction model

### 4.1 Selection

The project screen has one selection, or none: a component, an edge, a workflow, a step, a workload, or a finding. It's held by the project screen, above both columns, so the diagram, the drawer, the lists, and the run's results all read the same one. It isn't saved with the project, and it isn't an undo step.

**How the selection and the focus look.** They are two things and look like two things. The focus ring means the DOM focus: it's drawn on whatever element has it, whatever put it there (a key, a click, or code), and nothing else is ever a ring. The selection is a filled bar down the left edge of what's selected: a box on the diagram, a row in a list or the text version, and Details itself, so one rule holds on every surface. A selected edge has no left edge, so it keeps its thicker stroke. The selection stays marked while the focus is in Details, so you can see which box or arrow Details shows; a click always shows the ring, even though every click leaves one, because a click that moves the focus by code (after a remove, or onto Details' heading) wouldn't otherwise show where it went.

**Tab in the canvas doesn't select.** Selecting moves the focus to Details' heading (below), so selecting on focus would pull the focus away before a keyboard user reached the next box. Focus is where you are; selection is what you act on; they can sit on different things, and that's why they look different.

What each part of the screen does with it:

| Selected | Diagram | Details tab | Elsewhere |
|---|---|---|---|
| Component | Marks the component | Its settings (§2.2) | |
| Edge | Thickens the edge | Its latency, timeout, retry, and the steps that call along it | |
| Workflow | Highlights the components and edges it uses | Its outline (§2.5) | Its row in the list is marked |
| Step | Marks the step's component, and the edge the call arrives on | The workflow's outline, with the step marked | |
| Workload | Nothing | The workload editor (§2.7) | Its row in the list is marked, and the project bar picks it (§3.1) |
| Finding | Marks the components it names | Stays closed: the finding is read in the Run tab | Charts shade its time window and its cause's ([§3.3](#33-the-items-punted-from-m5)) |

- **The keyboard path.** Everything selectable can be selected outside the canvas, by a button: components and connections in the diagram's text version (today plain list items), workflows and workloads in their lists, steps in the outline, and findings in the Run tab. The canvas's nodes and edges can be focused and selected with Enter as well, but nothing depends on it.
- **Focus.** Selecting a component, edge, workflow, step, or workload opens Details and moves the focus to its heading. Escape there clears the selection, shows Run again in the wide layout, and returns the focus to whatever made the selection: a workload's row, or the project bar's Edit. Selecting a finding leaves the focus on the finding. Adding a workload, like adding a component, puts the focus on the new one's name field instead, since renaming is what comes next.
- **The mouse.** Clicking a node, an edge, or a list row selects it; clicking the canvas's empty space clears the selection.
- **When the selected thing goes.** Removing it clears the selection and moves the focus to "Add component" ("Add workload", for a workload, since "Add component" is no nearer), since what made the selection may be gone with it ([#95](https://github.com/alanbickel/wind-tunnel/issues/95)); and undoing the remove selects it again, unless a workflow or a step has been selected since, which stays selected so its outline shows the step's issue going. A finding names components from the run's own copy of the project (§4.2), so it can name one that's since been removed: selecting it then marks nothing, and the finding says **New** "orders-db isn't in the project any more."

### 4.2 Run freshness

Today a run isn't tied to anything. `useSimulationRun` keeps the latest run's workload and snapshots in memory, and `useRunFindings` words its findings from the project as it is now: the phrasebook looks up each component's type in the current project. Once the project can change, an old run would be worded against the new project, and a component removed since would have no type to word it.

[ADR-0018](../adr/0018-tie-a-run-to-the-model-it-ran.md) decides:

- **A run keeps the model it ran.** Starting a run copies the project, and everything shown about that run reads the copy: the findings and their wording, the totals, and anything else drawn from the run (such as status dots, once they exist). The run is shown as it was, whatever has changed since.
- **A run is current while what it ran is unchanged.** The comparison is by content: the run's architecture, its workflows, and the workload it ran, against the project's now. The project's name and description, the diagram's layout, and the other workloads don't change a run's results, so they don't count. Undoing back to what ran makes the run current again.
- **Runs aren't stored.** As today, the screen keeps its latest run until the user leaves; nothing is added to the project document.

What the screen says when the run is out of date:

- The project bar adds "Out of date" after the verdict ([§3.1](#31-wide)).
- The Run tab opens with **New** "This run is of an earlier version of the project. Run again to see your changes." above the findings, which stay as they were.
- Once status dots exist, they're drawn hollow, and the diagram's text version says they're from an earlier version ([§3.3](#33-the-items-punted-from-m5)).
- A run that's still going is shown out of date as soon as the project changes; it carries on with the copy it started with.

Saying *what* changed since the run ("you changed orders-db's query workers") needs a comparison of two models, which is the start of comparing runs, and waits with it ([§7](#7-not-yet)).

### 4.3 Editing and saving

Agreed with the maintainer (2026-10-24), and recorded in [ADR-0019](../adr/0019-edit-projects-with-commands-and-save-each-change.md):

- **Validate, then save at once.** Each change is validated and saved as it's made; there's no Save button. A value that fails validation stays in its field, with its message, and never reaches the stored project (§2.2).
- **The architecture and the workflows are validated apart.** The architecture (components, their settings, edges) must always be valid, or the change doesn't save. Workflows and workloads may have issues, such as a step that calls a removed component or a workload with an empty mix. Those issues show where they are, stop a run of the workloads they affect, and don't stop a save (§2.4, §2.5).
- **A remove takes only what it owns.** Removing a component removes it and its own edges, never workflow steps; the confirmation names the steps that call it (§2.4). Removing a step removes the calls under it, and its async work (§2.5).
- **Edges belong to the architecture.** They're drawn, edited, and removed on their own, and shown whether or not a step uses them. A call along a missing edge adds the edge, as a shortcut (§2.1, §2.5).

How it works:

- **A change is a command.** Each thing a user does is one command: set a setting, rename, add or remove a component, connect, add, change, move, or remove a step, and so on. A command is a plain function in `application/` that takes the project record and returns the next one; it does the whole change, so removing a component also removes its edges. The UI never assembles a record by hand.
- **A field holds a draft.** What's typed into a field stays in the field until it passes the field's own checks: the field descriptor's range, a distribution's rule that its p99 is at least its median, a profile point's time that it lies between its neighbours' (§2.7 step 6), and a component name that no other component of its type uses (**New** "Another RDS component already uses this name. Please choose another name."). Only then, on Enter or on leaving the field, does it become a command. So a user can't make an invalid architecture from the screen: pickers offer only what exists, and fields check before they commit. Escape puts back the saved value (§2.2).
- **Saving validates.** A new use case saves an edited record. It checks the architecture first, as a backstop, and refuses a record that fails, so nothing invalid is ever stored; then it stamps `updatedAt` from the `Clock` and saves. Workflow and workload issues don't stop it.
- **Saves go in order.** The screen shows the record it holds, and sends saves one at a time, so a fast typist's changes land in the order they were made. If a save fails (the browser's storage refused it), the project bar says **New** "Couldn't save your last change." and offers "Try again"; the change stays on screen.
- **Undo.** Each saved command is one undo step, a remove with what it took included: undoing a workflow's removal brings back the workflow and its entries in the workloads' mixes, at their weights. Undo and Redo save the record before or after it, as a new save. The history lasts while the project is open, and isn't stored. A field's draft is never a step, and nor is the selection or a run. Moving a node is a step when the drag ends.
- **Where issues show.** A workflow or workload issue shows where it is: on the step or the mix entry, in the drawer, with its message (§2.4); as a count on its row in the lists, **New** "1 problem"; and in the project bar, where a workload that can't run is marked in the picker and Run says why ([§3.1](#31-wide)). `findRunIssues`'s issue paths already locate each one: for a workload, a mix entry's path marks its row in the mix, a profile point's marks its row in the table, and the workload's own (an empty mix, an empty profile) mark the section. The workload editor shows the issues an edit can make, an empty mix (when the last workflow in it is removed, §2.7 step 10) and a mix entry whose workflow is gone from a stored project; the screen's own fields can't make an unordered profile, a negative rate, or a weight that isn't positive (§4.3's drafts), though a stored project can have them, and they show the same way. A profile point past the duration is a note on its row, not an issue (§2.7 step 7). An architecture issue can't come from an edit; a stored project that has one, from an older version, still gets today's "can't open" screen.

### 4.4 What a screen reader hears

A change saves when its field is left, and what follows can show somewhere else on the screen. A sighted user sees it; a screen reader user hears it only if it's announced.

- **Status messages are announced politely**, without moving the focus: "Out of date" when the run on screen goes out of date (§4.2), "Couldn't save your last change." when a save fails, and a workload's "can't run yet" when a change stops it running (§2.4). Each comes from a live region that's on the page before its text changes, since many screen readers skip a region that appears with its text already in it (today's messages work the same way).
- **A field's error is tied to its field.** The field is marked `aria-invalid`, and its `aria-describedby` points at the message, so the message is read whenever the field has the focus. Leaving a field with a draft that fails its checks also announces the message, since the focus has moved on.
- **A save that works isn't announced.** The change is what the user just did, and the field shows it.
- **A workload that can't run is announced** by the project bar's "can't run yet" region, so adding a workload, or removing the last workflow from its mix, is heard there (§2.7 steps 2 and 10). The changes to a workload that have no message elsewhere, such as a mix row's share changing as another weight does, aren't announced: the field the user is in shows its own result, and the shares are read from the table when it's visited.
- **A remove is announced:** "Removed orders-db." The focus moves to "Add component" (§4.1), away from what changed, so nothing on it says the component went. The message comes from a polite region beside that button, on the page from the start (decided in [#95](https://github.com/alanbickel/wind-tunnel/issues/95)). A workload's removal is announced the same way, from a region beside "Add workload": "Removed Lunch rush." (§2.7 step 11).

Each slice that adds one of these messages announces it ([§6](#6-slices)).

## 5. Data needs

Each row is something a journey step needs: whether it exists today, the change if not, and whether that change breaks a stored project or a public shape.

| Need | Today | Change | Breaking? |
|---|---|---|---|
| Labels, units, and help for each setting, including how a real AWS setting maps to the model's (2.1, 2.2) | The config schemas validate. Their field docs are JSDoc comments, which code can't read at runtime ([`lambda.ts`](../../src/domain/components/aws/lambda.ts)) | Field descriptors, registered per component type in `application/` beside the type's finding wording (ADR-0015): a label, a unit, help that cites its fidelity entry, a range, and how sure the default is: Documented, Observed, or an Assumption, with the fidelity entry that would tighten it, as fidelity's [defaults table](fidelity.md#default-values-and-their-evidence) gives it. The help shows it ("Default 16: an assumption (RDS-2)."), beside a "Reset to default" control. Field kinds: number, whole number, and distribution | No |
| Messages a user can act on for a bad value (2.2) | Config issues are Zod's messages ("Too small: expected number to be >=1"), or a schema's own, keyed by field ("p99Ms must be at least medianMs") | The field descriptors' ranges word the messages ("Query workers must be at least 1."); the schemas stay the authority | No |
| A line on what each type is for, in "Add component" (2.1) | `displayName` only | A description beside each type's field descriptors | No |
| A new component's settings and id | `defaultConfig` on each definition; the `IdGenerator` port, which makes UUIDs | None: settings from `defaultConfig`, the id from `IdGenerator`, and a name from the type and a number ("lambda-1") | No |
| Component names on screen (2.1, 2.4) | The diagram shows `name`; findings and the CLI show `id`. The templates make them equal, but a new component's id is a UUID, so a finding would read "3f2a…: throttled" | The id is internal and never shown: findings and the CLI show names. A name is unique among the project's components of its type, an architecture rule: a Lambda and a DynamoDB table may both be "orders", two Lambdas may not ("Another Lambda component already uses this name. Please choose another name."). Where components of two types share a name, the screen adds the type: "orders (DynamoDB): throttled". A rename changes only the name, so nothing that refers to the component changes | No: stored projects come only from templates, whose names are unique |
| Saving an edited project (2.2) | No use case saves an edited project. `ProjectRepository.save` stores a record as given; validation runs only when a project is opened, so an invalid save would make the project unopenable | A use case that validates the architecture, then saves; edit commands in `application/` (ADR-0019) | No |
| Workflow and workload issues that stop a run, not a save (2.4, 2.5) | `findProjectIssues` checks everything as one, and opening a project refuses it if anything fails, a step's missing edge included | Split the checks: architecture issues refuse a save; workflow and workload issues are kept with the project, shown where they are, and stop a run of the workloads they affect. Opening a project accepts the second kind (ADR-0019) | No: it accepts more |
| Drawing and editing edges (2.1) | Edges come only from templates, and nothing edits them | Connect on the diagram, and a keyboard way ("Connect to…"); an edge's settings in the drawer; remove an edge | No |
| Defaults for a new edge (2.1) | Edges have no defaults | Each component type declares the defaults of the edges it calls along, beside its `defaultConfig`, so a new type brings its own. Each default says how sure it is, as a setting's does, and fidelity's defaults table gets a row for each. To start: 1 ms latency and one attempt (assumptions), and a timeout of 29 s from API Gateway (**Documented**, §2.1 step 5) or 5 s from the other types (an assumption) | No |
| What calls a component (2.1, 2.4) | Nothing works it out | "Called by", from the workflows' steps | No |
| Unique workflow names (2.5) | Nothing stops two workflows sharing a name | No two workflows of a project share a name, compared without the spaces around it and ignoring case, as project names are. Adding and renaming one check it (`checkWorkflowName`); stored projects with duplicates keep them. Renaming one makes a run out of date, since workflows are part of what ran (ADR-0018); a project's rename doesn't | No: it accepts more |
| A workflow's path on the diagram (2.1, 2.5) | `diagramOf` knows nothing of workflows | The components and edges a workflow uses, to highlight, and a line for the text version | No |
| Unique project names (2.1, 2.3) | Nothing stops two projects sharing a name; every copy of a template has the template's | No two projects share a name, compared without the spaces around it and ignoring case. Creating a blank project and renaming one refuse a name in use; a template copy whose name is taken gets the first free number, "Serverless API with RDS (2)". The application checks it against the list it reads, not the repository, so two tabs creating at once could still clash | No: names already shared stay, and the rule applies only when a name is chosen |
| A project with nothing in it (2.1) | Projects come only from templates | A blank project: a name, and no components, edges, workflows, or workloads. Today's schema and checks already accept it; it has nothing to run | No |
| Placing a new component (2.4) | `diagramOf` places a component the layout doesn't list; nodes can't be dragged | Drag a node; the drag's end is a command that saves its position in the layout | No: the layout is already stored |
| Which version of the project a run ran (2.2) | `useSimulationRun` keeps one run in memory, and its findings are worded from the current project | The run keeps a copy of the project, and is current while its content matches (ADR-0018) | No: runs aren't stored |
| A template project after editing (2.3) | `source` names the template and version | None: `source` says what the project was created from, not that it still matches | No |
| Labels, units, ranges, and help for a workload's fields (2.7) | Field descriptors are per component type, and each number descriptor carries the evidence for its default (`NumberFieldDescriptor`) | A small fixed set in `application/details/`, not per type, for the fields below. They have no AWS evidence, since they're choices of the model and the editor, so they use a descriptor with a range and no evidence, not an invented one. Times are entered in seconds and held in milliseconds, as the stored document holds seconds and the domain milliseconds; the draft converts. **Duration:** "Duration", s, more than 0, no upper limit, help as §2.7 step 4 words it. **Seed:** "Seed", a whole number from 0 to 4,294,967,295 (the stored schema's range: only the low 32 bits are used), help as step 4. **Weight:** "Weight", more than 0, help as step 5. **Rate:** "Rate", requests/s, 0 or more, **New** "The target arrival rate at this time. Requests arrive at random, so a given second may get more or fewer. The rate follows a straight line from one point to the next, and holds before the first point and after the last." **Time:** "Time", s, 0 or more and between its neighbours', **New** "When this point applies, in seconds from the start of the run." Each message is worded as §2.2's are ("Duration must be more than 0 s.", "Rate can't be negative.", "Time must be after 10 s and before 40 s."), and a test checks the ranges against the stored schema as for components | No |
| What a new workload starts with (2.7 step 2) | A blank project has none; a template's are written by hand | `addWorkload` takes a new id (`IdGenerator`) and writes: the first free name of the form "workload-1"; 60 s; seed 42; an empty mix; one point, 0 s at 100 requests/s. They are editor defaults, assumptions made to be edited, not claims about any system or project: a duration long enough to see a load settle, a seed the docs use throughout, a modest flat rate, and a valid profile, so the only thing left to finish before it can run is the mix. The empty mix is the one issue it starts with: it saves, and can't run until a workflow is in it (§4.3). `addWorkload` is the only command that writes these numbers, so changing them is one place | No |
| Unique workload names (2.7 step 3) | Nothing stops two workloads sharing a name (a template's workloads are named by hand) | As workflow names: unique, compared without the spaces around them and ignoring case; adding and renaming check it (`checkWorkloadName`); stored projects with duplicates keep them. A rename makes a run of that workload out of date, since the workload is part of what ran (ADR-0018, and `runIsCurrent` already compares the whole workload) | No: it accepts more |
| Shares beside a mix's weights (2.7 step 5) | Nothing computes them | `mixShares`: each weight ÷ the total, to a tenth of a percent, the last tenths given by largest remainder so they add to exactly 100.0%; undefined for an empty mix, which shows no total. A weight too small to show a tenth shows 0.0%, and the total still reconciles. Which workflows the "Add to mix" picker offers: the project's workflows less the mix's | No |
| What the profile does past the duration, and before and after its points (2.7 steps 6, 7) | `rateAt` holds the first point's rate before it and the last's after it, and interpolates between; arrivals stop at `durationMs`; `findWorkloadIssues` doesn't check a point past the duration. The thinning draws candidates at the highest rate of **every** point, one past the duration included | A point past the duration is allowed, and noted on its row by `profileNotes`, not an issue: the engine's run is well defined (the first `durationMs` of the line), and a user may want a shorter look at a long profile. The alternatives were a new run issue, which stops that look, and a duration that can't go below the last point, which makes shortening a run a chore of removing points first. One consequence for the seed's help: a point past the duration doesn't change the rate the run follows before its end, except that the line runs toward it, but it does change which random numbers are drawn, so removing one gives another run from the same seed, with the same distribution | No: nothing stored changes |
| A preview of the profile (2.7 step 6) | The run's charts show arrivals after a run | A read-only chart, loaded lazily as the other charts are, of `profileLine(workload)`: the points, with the level stretches before the first and after the last, up to the duration, the end marked. Drawn from the draft table values as they commit, not before. The table is the accessible version, so the chart has a short label and nothing to focus. Dragging a point on it is left for later ([§7](#7-not-yet)) | No |
| Selecting a workload (2.7, 4.1) | `Selection` has no workload kind | `WorkloadSelection { kind: "workload", workloadId }`, and its details (`workload-details`: the fields' current values, the mix rows with shares, the profile rows with notes, each with its issues). `useProjectRun`'s `picked` follows a selection and an add (§3.1) | No |
| A "new random seed" control (2.7 step 4) | Not present | None for now: the seed is a number field only. A user trying seeds wants to compare the runs they make, which waits with comparing runs ([§7](#7-not-yet)). Adding it later is a button and a `RandomSource`-backed port, since `application/` can't draw a random number itself | No |

## 6. Slices

The M6 Roadmap items, in build order. Each can be used when it merges, and each names the parts of this page it builds. The slices before "Add and remove components" work on a copied template, so the screen and the edit model are in place before a project can change shape.

1. **The project bar.** The project's name, the workload picker, Run and Stop, and the run's status move into a bar above the columns; the right column becomes the Details and Run tabs, Details empty until something can be selected. Settles TODO look-and-feel item 5. [§3.1](#31-wide), [§3.2](#32-narrow)
2. **Select a component and read its settings.** Selection held by the project screen; components and edges selectable on the diagram and in its text version; the Details tab shows a component's settings or an edge's, read-only, with field descriptors' labels, units, and help, each default with its evidence, and "Called by". [§4.1](#41-selection), [§5](#5-data-needs) (field descriptors, what calls a component)
3. **Select a finding.** Selecting a finding marks its components on the diagram and shades its time and cause windows on the charts. One of the items punted from M5. [§3.3](#33-the-items-punted-from-m5), [§4.1](#41-selection)
4. **Show component names, not ids.** Findings and the CLI show names, with the type added where two types share one; a name is unique among its type's components. Needed before a new component's UUID could reach the screen. [§5](#5-data-needs) (component names)
5. **A run keeps the model it ran.** The run copies the project, its findings are worded from the copy, and the screen says when it's out of date, announced as a status message. [§4.2](#42-run-freshness), [§4.4](#44-what-a-screen-reader-hears), ADR-0018
6. **Edit a component's settings.** Edit commands and the use case that validates the architecture and saves; fields that hold a draft and word their own messages, tied to the field; number and distribution fields; the component's name field, with its uniqueness check; "Reset to default"; a failed save's "Try again", announced. [§2.2](#22-edit-a-components-settings), [§4.3](#43-editing-and-saving), [§4.4](#44-what-a-screen-reader-hears), ADR-0019
7. **Validate workflows apart from the architecture.** Workflow and workload issues are saved and open, and stop only a run of the workloads they affect; the project bar and the picker say why, announced when a change stops a workload running. Replaces the earlier "show validation issues inline" item, whose other parts are in the editors below. [§4.3](#43-editing-and-saving) (where issues show), [§4.4](#44-what-a-screen-reader-hears), [§5](#5-data-needs)
8. **Add and remove components.** "Add component" with each type's line on what it's for, a default name, and the default settings; Remove, with a confirmation that names the steps calling it, and those steps marked. [§2.4](#24-add-a-component-and-remove-one)
9. **Connect components.** Draw an edge on the diagram or with "Connect to…", edit its settings in the drawer, and remove it; each type declares the defaults of the edges it calls along, with their evidence in fidelity's defaults table. [§2.1](#21-model-your-own-system) step 5, [§5](#5-data-needs) (edges)
10. **Move nodes.** Drag a node, and its position saves in the layout. [§2.4](#24-add-a-component-and-remove-one) step 1
11. **Undo and redo.** One step per saved command, a remove with what it took; in the project bar. [§4.3](#43-editing-and-saving)
12. **Start a blank project.** "Create blank" beside "Create from template", and the empty diagram's prompt. [§2.1](#21-model-your-own-system) step 1
13. **Rename a project.** In the project bar. [§2.3](#23-rename-a-project)
14. **Workflow editor.** The workflows list; a workflow's outline in the drawer; add, change, move, and remove steps, with a call along a missing edge adding it; a selected workflow's path on the diagram and in the text version; issues on their steps. [§2.5](#25-describe-a-requests-path), [§4.1](#41-selection)
15. **Async work.** The async work slot under an `enqueue` step, and changing a step's action in place. [§2.5](#25-describe-a-requests-path) step 8, [§2.6](#26-sketch-put-a-queue-in-front-of-a-slow-component)
16. **Workload editor**, as five pieces, each one PR and usable when it merges ([#178](https://github.com/alanbickel/wind-tunnel/issues/178)), after this design (#179). [§2.7](#27-describe-the-traffic), [§2.1](#21-model-your-own-system) step 7
    1. **See a project's workloads** (#180). The workloads list, selecting a workload, the project bar's Edit, and Details showing a workload read-only, with its issues. [§3.1](#31-wide), [§4.1](#41-selection)
    2. **Add, rename, and remove a workload** (#181). `addWorkload`, `renameWorkload`, `removeWorkload`, the name field and its check, the confirmation, the picker's next pick, and the announcement. [§2.7](#27-describe-the-traffic) steps 2, 3, 11
    3. **Edit a workload's duration and seed** (#182). The two fields, their descriptors, ranges, and messages. Step 4
    4. **Edit a workload's mix** (#183). Add to and remove from the mix, weights, shares, the picker's offer, and a removed workflow's effect on it. Steps 5 and 10
    5. **Edit a workload's profile** (#184). The table, the point commands, the neighbour-bounded time, the notes past the duration, and the preview chart. Steps 6 and 7
17. **Export and import a project as JSON** ([#21](https://github.com/alanbickel/wind-tunnel/issues/21)), unchanged by this design.

## 7. Not yet

What this design places but leaves for later:

- **Comparing a run with the one before, and saying what changed since the run.** Both need a comparison of two models ([§4.2](#42-run-freshness)). Moved to the Roadmap's Not scheduled when M6 was refocused on modeling your own architecture.
- **A "take this fix" control** on a Wind Tunnel fix. It needs a fix to name its component, setting, and value. Also in Not scheduled.
- **Node status dots.** [§3.3](#33-the-items-punted-from-m5) gives them their place and their out-of-date look, but they show a run's results, not the user's system, so they wait. Also in Not scheduled.
- **Dragging a profile point on the preview chart**, and a **"new random seed" control.** The table and the number field do the same work ([§2.7](#27-describe-the-traffic), [§5](#5-data-needs)); dragging is worth it only if the table proves slow for shaping a curve, and a new seed only once runs can be compared.
- **A third column on very wide windows**, so Details and Run sit side by side ([§3.1](#31-wide)). It's a stylesheet change once the two tabs exist, worth it if moving between a finding and the setting it names proves slow.
