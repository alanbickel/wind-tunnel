# User Experience: Modeling Your Own Architecture

Wind Tunnel exists so a developer can represent their own system and see how it behaves. Through M5, a user could only copy a template and run it, on a screen built for reading a run: the diagram on one side, and the run's verdict, findings, totals, and charts on the other. M6 ("Model my own architecture") lets the user build and change a project of their own. The templates become starting points, and the run, verdict, and findings work on whatever the user builds. This page designs the whole experience before any M6 code ([#81](https://github.com/alanbickel/wind-tunnel/issues/81)), so each new feature fits one design rather than being added to the screen on its own. ADRs record the decisions that are hard to reverse.

The method is the one [findings.md](findings.md) used. Write journeys as a user would live them ([§2](#2-journeys)). Then work out the layout ([§3](#3-layout)), the interaction model every panel shares ([§4](#4-interaction-model)), and the data each step needs ([§5](#5-data-needs)). Last, cut the work into the Roadmap's items ([§6](#6-slices)).

The build order: view and edit a component's settings, then add and remove components, start a blank project, and rename the project, then the workflow step editor. The first slices are designed in depth. The later ones get just enough design that the edit model and layout won't need redoing for them.

## How to read this page

Times, the evidence tags ([totals], [snapshots], [config]), and the levels of an AWS claim (Documented, Observed, Assumption) are findings.md's: see [How to read that page](findings.md#how-to-read-this-page). This page adds two marks:

- **New** marks screen text this design proposes. Unmarked screen text in a quote is what the screen shows today.
- **Proposed** marks a step that needs a decision from a later section, and links it. The journeys come first, so that those sections answer to them.

## 1. The modeling loop

*To write:* one paragraph. Describe part of your system, check that Wind Tunnel's picture of it is right (the diagram, the drawer, validation), and run it. Every M6 feature helps a user represent their own system; a feature that doesn't waits.

## 2. Journeys

Each journey goes step by step: what the user does, and what the screen shows in reply. Where a journey runs the project, the run is seed 42, from `npm run simulate`, and its numbers are quoted.

### 2.1 Model your own system

*To write:* start a blank project (or a template, as a shortcut), add components, set their settings, connect them, describe a request's path, set the traffic, and run it. Includes translating a real setting to the model's: some model settings, such as RDS query workers, aren't AWS settings.

### 2.2 Edit a component's settings

*To write:* open a component, change a plain number, a distribution, and an invalid value. What saves, and how it's undone.

### 2.3 Rename a project

*To write.*

### 2.4 Add a component, and remove one

*To write:* add a component that does nothing until a workflow calls it. Remove a component that steps and edges still use: what the user is told, and what happens to them.

### 2.5 Sketch: put a queue in front of a slow component

*To write, as a sketch:* needs the workflow step editor and new edges. Enough to test the edit model and layout against.

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
| A new component's settings and id | `defaultConfig` on each definition; the `IdGenerator` port | None expected | No |
| Saving an edited project | `SaveProject` validates and refuses an invalid project | *Open:* depends on the edit model (§4.3) | *Open* |
| Edges: latency, timeout, retry | Every workflow call must follow an edge; no M6 item edits edges | *Open:* where edges are edited | No |
| A project with nothing in it | Projects come only from templates; `SaveProject` validates whatever it's given | *Open:* what a blank project holds, and whether it's valid | No |
| Placing a new component | `diagramOf` places a component the layout doesn't list; nodes can't be dragged | *Open:* drag, and save positions in the layout | No |
| Which project revision a run ran against | `useSimulationRun` keeps one run in memory, not tied to a revision | *Open:* run identity (§4.2) | *Open* |
| A template project after editing | `source` names the template and version | *Open:* what `source` means once the project has changed | No |

## 6. Slices

*To write:* the M6 Roadmap items re-cut from this design, each naming the sections it builds.

## 7. Not yet

*To write:* what this design leaves for later, and why. Known so far: comparing a run with the one before, and a "take this fix" control, which needs a fix to name its component, setting, and value. Both moved to the Roadmap's Not scheduled when M6 was refocused on modeling your own architecture.
