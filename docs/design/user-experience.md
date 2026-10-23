# User Experience: Reading a Run and Changing the Architecture

Until M6, the project screen is for reading a run: the diagram on one side, and the run's verdict, findings, totals, and charts on the other. M6 ("Let me play") adds editing. This page designs the whole experience before any M6 code ([#81](https://github.com/alanbickel/wind-tunnel/issues/81)), so each new feature fits one design rather than being added to the screen on its own. ADRs record the decisions that are hard to reverse.

The method is the one [findings.md](findings.md) used. Write journeys as a user would live them, against real runs ([§2](#2-journeys)). Then work out the layout ([§3](#3-layout)), the interaction model every panel shares ([§4](#4-interaction-model)), and the data each step needs ([§5](#5-data-needs)). Last, cut the work into the Roadmap's items ([§6](#6-slices)).

The build order: view and edit a component's settings, then add and remove components and rename the project, then the workflow step editor. The first slices are designed in depth. The later ones get just enough design that the edit model and layout won't need redoing for them.

## How to read this page

*To write:* how times, numbers, and evidence are cited. Use findings.md's conventions ([totals], [snapshots], [config]; Documented, Observed, Assumption), and say where this page differs.

## 1. The core loop

*To write:* one paragraph. Read a finding, find its cause, change something, re-run, and see whether the finding went away. Every M6 feature is a step in this loop; a feature that isn't one waits.

## 2. Journeys

Each journey goes step by step: what the user does, and what the screen shows in reply. The runs are seed 42, from `npm run simulate -- --template <id> --workload <id>`.

### 2.1 Template A, lunch rush: from connection exhaustion to a fix

*To write:* from the failing verdict to the connection-exhaustion finding, then to the RDS component and its settings. Raise the limit, re-run, and see the verdict change. Quote both runs' numbers.

### 2.2 Rename a project

*To write.*

### 2.3 Add a component, and remove one

*To write:* add a component that does nothing until a workflow calls it. Remove a component that steps and edges still use: what the user is told, and what happens to them.

### 2.4 Sketch: put a queue in front of a slow component

*To write, as a sketch:* needs the workflow step editor and new edges. Enough to test the edit model and layout against.

## 3. Layout

*To write:* where the details drawer, the editors, the run controls, and the findings live, and what stays visible while editing. ASCII wireframes of the wide and narrow layouts. This settles whether the run controls move to the top bar. It also places the items punted from M5: selecting a finding highlights its component, and node status dots.

## 4. Interaction model

### 4.1 Selection

*To write:* one selected thing (a component, edge, finding, or step), held above the panels. What each panel does when the selection changes. The keyboard path, and the diagram's text version.

### 4.2 Run freshness

*To write:* what the screen says when the run on screen no longer matches the project, as in a finding that names a component since removed. Also, whether the previous run is kept to compare against. ADR: run identity.

### 4.3 Editing and saving

*To write:* edit commands that keep the project valid (removes that cascade, a call that creates its edge), or a draft that may be invalid, with its issues inline and saving blocked until they're fixed. Then undo, and autosave or an explicit save. ADR: the edit model.

## 5. Data needs

Each row is something a journey step needs. Rows marked *open* are filled in as the journeys are written.

| Need | Today | Change | Breaking? |
|---|---|---|---|
| Labels, units, and help for each setting in a form | The config schemas validate. Their field docs are JSDoc comments, which code can't read at runtime ([`lambda.ts`](../../src/domain/components/aws/lambda.ts)) | *Open:* field descriptors registered with each component type; distributions as a field kind | No |
| A new component's settings and id | `defaultConfig` on each definition; the `IdGenerator` port | None expected | No |
| Saving an edited project | `SaveProject` validates and refuses an invalid project | *Open:* depends on the edit model (§4.3) | *Open* |
| Edges: latency, timeout, retry | Every workflow call must follow an edge; no M6 item edits edges | *Open:* where edges are edited | No |
| A fix's setting, for "try this fix" | A `Fix` has a message and its evidence, but no target | *Open:* a component and setting on the fix | No |
| Placing a new component | `diagramOf` places a component the layout doesn't list; nodes can't be dragged | *Open:* drag, and save positions in the layout | No |
| Which project revision a run ran against | `useSimulationRun` keeps one run in memory, not tied to a revision | *Open:* run identity (§4.2) | *Open* |
| A template project after editing | `source` names the template and version | *Open:* what `source` means once the project has changed | No |

## 6. Slices

*To write:* the M6 Roadmap items re-cut from this design, each naming the sections it builds.

## 7. Not yet

*To write:* what this design leaves for later, and why.
