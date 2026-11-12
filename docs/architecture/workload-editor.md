# The Workload Editor

How a workload gets from the project document to what the screen shows, for maintainers new to the code. A workload is the traffic: which workflows run, in what mix, at what rate over time, for how long, from which seed ([UX design §8](../design/user-experience.md#8-workloads)). Today the screen lists a project's workloads, adds, renames, and removes them, and shows a selected one's duration and seed as fields, and its mix and profile read-only, in Details; the pieces that edit those ([#183](https://github.com/alanbickel/wind-tunnel/issues/183) and [#184](https://github.com/alanbickel/wind-tunnel/issues/184)) extend this guide. A workload isn't a workflow: [the workflow editor](workflow-editor.md) says how workflows work, and the two meet at "Used by" (a workflow's Details names the workloads whose mix has it) and at the mix entries a removed workflow takes with it. Read [the domain model](domain-model.md) and [the user interface](user-interface.md) first.

## A workload, three ways

**1. The stored document.** What `Project.workloads` holds: an `id`, a `name`, `durationMs`, a `seed`, a `mix` of `{ workflowId, weight }` entries, and a `profile` of `{ atMs, requestsPerSec }` points. The engine reads the ids; the user never sees them.

**2. The Details a user reads.** `DescribeSelection` answers a `{ kind: "workload" }` selection with a `WorkloadDetails` (built by `workloadDetails` in [`application/details/`](../../src/application/details/workload-details.ts)): the name, the duration in seconds, the seed, the mix as rows, and the profile as rows. Every word and every sum is made there; [`WorkloadView`](../../src/ui/project/WorkloadView.tsx) only lays them out.

- **A mix row** has the workflow's name, its weight, and its share: "Get order, 80, 80.0%". A workflow the project no longer has reads "A workflow that is no longer in the project." in place of a name, because an id is never shown. An empty mix says "No workflows in the mix. A workload with an empty mix can't run."; otherwise the rows end with "Shares total 100%".
- **A profile row** has a time in seconds and a rate in requests per second, in stored order. A point past the run's end gets a note (below).
- **A share** is the entry's weight over the total, to a tenth of a percent. Rounding each share on its own gives 33.3% three times, which adds to 99.9%, so `mixShares` rounds each down to a tenth and gives the tenths left over, one each, to the entries with the largest remainders (the earlier entry wins a tie). The shares add to exactly 100.0% for any weights, and "Shares total 100%" is therefore true. An entry whose weight isn't positive counts as none (the run's own check refuses it); with no positive weight at all there are no shares to show.
- **A note** is `profileNotes`' for a point past the run's end (`atMs > durationMs`): "After the run's end (30 s). Arrivals follow the line toward this point, and the run stops at 30 s." A point exactly at the end is the end of the line, so it has no note.

**3. The line the engine follows.** The rate is a straight line between the profile's points, level before the first and after the last, cut off at `durationMs`; the mix picks each request's workflow by weight. That's why a point past the end still matters: the line toward it is what the run follows until it stops.

```mermaid
flowchart LR
    stored["Project.workloads<br/>(stored document)"]
    check["workloadRunCheck<br/>own issues + paths"]
    details["workloadDetails<br/>rows, shares, notes"]
    view["WorkloadView<br/>(ui)"]
    list["WorkloadList<br/>row + problem count"]
    stored --> check
    stored --> details
    check -->|"issues by path"| details
    details --> view
    check -->|"problems"| list
```

## How an issue finds its row

A workload's own run issues come from `findWorkloadIssues`, which gives each a path into the project: `["workloads", 0, "mix", 2, "weight"]`, `["workloads", 0, "profile", 1, "atMs"]`, or, for an empty mix or profile, `["workloads", 0, "mix"]`. `workloadRunCheck` words them (`ownIssues`) and the Details builder sorts them by that path: the third element is the section (`mix` or `profile`), the fourth, if there is one, the row's index. An issue with an index goes on that row; one without goes on the section. A mix entry's repeated workflow and non-positive weight both land on its row, an unordered profile point and a negative rate both on theirs.

The issues the project bar says (`WorkloadRunCheck.issues`) are these plus the step issues of the workflows in the mix; the step issues show in those workflows' outlines, not here. The list row's count, `WorkloadRunCheck.problems`, counts only the workload's own, so every problem it counts is one Details shows on a row.

## Selecting a workload

- **The list.** Under the workflows list, in the canvas's "Workflows" panel, "Workloads" lists them in project order, a button each, marked `aria-current` while selected, with "· 1 problem" after the name when it has issues. With none, it says what a workload is.
- **Details.** Selecting a workload is a `WorkloadSelection` held by the project screen like any other: the focus goes to Details' heading, and Escape clears the selection and returns the focus to whatever made it, the row or the top bar's Edit. Details' header has Remove, and its body starts with the name field ([below](#adding-renaming-and-removing)).
- **The picker follows one way.** Selecting a workload picks it in the top bar, so Run runs what the user is looking at; picking in the bar changes only the bar. The picker remembers the workload's id and reads the workload from the project each time (`usePickedWorkload`), so a rename shows in it at once; if the project no longer has the picked workload, as after an Undo of its add, the picker shows the project's first. Edit, beside the picker, selects the picked workload. `usePickSelectedWorkload` does the picking, and only when the selection changes: a change to the project doesn't pick the selected workload again, or it would undo a pick made in the bar since.
- **Undo and redo.** `selectionAfterUndo` keeps a selected workload while the project has it, and clears it once it doesn't; an undo or redo that brings a workload back, such as an Undo of its remove, selects it, unless a workflow or a step is selected and still there.

## Adding, renaming, and removing

Three commands in [`workload-edits.ts`](../../src/application/edits/workload-edits.ts) change which workloads a project has and what they're called. Each is pure: it takes the project record and returns the next one, and for a workload the project doesn't have, or a change that changes nothing, it returns the record it was given, so `edit` saves nothing for it ([ADR-0019](../adr/0019-edit-projects-with-commands-and-save-each-change.md)).

| Command | What it changes | Undo is named | What it announces |
|---|---|---|---|
| `addWorkload` | Appends a workload with the editor's defaults and a new id. Its name is the first free "workload-1", "workload-2", … (`firstFreeName`, comparing names as the name check does). | "Add workload workload-1" | The bar's status regions say why it can't run: "workload-1 can't run yet: The mix has no workflows." |
| `renameWorkload` | The name, and nothing else. | "Rename workload-1 to Lunch rush" | Nothing: the field shows it. A name that fails its check is announced from Details' region. |
| `removeWorkload` | Takes the workload. The workflows its mix named stay as they are. | "Remove workload Lunch rush" | "Removed Lunch rush." |

| `setWorkloadDuration` | `durationMs`, and nothing else: the profile keeps every point, past the new end or not. | "Change Lunch rush's duration to 45 s" | Nothing: the field shows it. |
| `setWorkloadSeed` | `seed`, and nothing else. | "Change Lunch rush's seed to 7" | Nothing: the field shows it. |

#183 and #184 add their commands to this table. Both new commands share a private `changeWorkload`, which finds the workload, applies the change, and returns the record itself when the workload is missing or the change changes nothing.

## Duration and seed

Details starts with two draft number fields, `WorkloadValueFields`, built from the parts a component's settings use: `useDraft`, `TextField`, `fieldKeys`, `describedBy`. Each commits on Enter or on leaving the field, puts the saved value back on Escape, checks on every render, and keeps a refused value in the field with its message tied to it by `aria-describedby`. A refused value never reaches a command.

| Field | Range | Where the range comes from | Message |
|---|---|---|---|
| Duration, in s | more than 0, no upper limit | The stored schema's `durationSec: z.number().positive()` | "Duration must be more than 0 s." |
| Seed | a whole number, 0 to 4,294,967,295 | The stored schema's seed: an integer in the engine's 32 bits | "Seed must be a whole number from 0 to 4,294,967,295." |

- **Descriptors without evidence.** [`workload-fields.ts`](../../src/application/details/workload-fields.ts) holds the two descriptors, a `RangedFieldDescriptor`: a label, unit, range, and help, and no `evidence`. A component setting's descriptor says how sure its default is, with a fidelity entry; these are the model's and the editor's choices, not claims about AWS, so there's nothing to cite and **fidelity.md has no entry for them**. The schema stays the authority: [`workload-field-ranges.test.ts`](../../src/adapters/persistence/workload-field-ranges.test.ts) feeds each end of each range, and a value just past it, to the stored schema.
- **Seconds typed, milliseconds held.** The user enters seconds, as the stored document holds them, and the domain holds milliseconds. `durationMsOf` converts, rounded to 12 significant digits so 1.005 s is 1,005 ms and not 1,004.9999999999999. The check returns the seconds typed, so the field compares it with the saved seconds and "45.0" is no change.
- **One message for the seed.** Whatever is wrong with a seed draft, the field says the range once, since "must be a whole number" and "at most 4,294,967,295" would both be true of 1.5e10 and say less than the range does.
- **The run.** Editing the workload that ran makes the run on screen out of date; editing another doesn't ([ADR-0018](../adr/0018-tie-a-run-to-the-model-it-ran.md), which compares the workload the run used).

## A point past the run's end

A profile point after the duration is allowed: not a run issue, and not a floor the duration field enforces, so shortening a duration never refuses a value the user can see is valid, and never edits the profile. Its row gets the [note](#a-workload-three-ways). What the engine does with it ([UX design §8](../design/user-experience.md#8-workloads), "A point after it is allowed"), pinned by tests in [`arrivals.test.ts`](../../src/domain/engine/arrivals.test.ts):

- **The slope.** The rate is read from the line between points, so a point past the end still sets the rate before it. With 2,000 requests/s at 40 s and 200 at 50 s, a 45 s duration has a rate near 45 s of 1,100, not 2,000 and not 200, and the last five seconds send about 7,750 requests, not the 10,000 a flat 2,000 would.
- **The draws.** `PoissonArrivalProcess` draws candidates at the *highest rate of any point*, then keeps each with probability rate over peak. A later point that doesn't raise the peak changes no arrival; one that does changes the draws (not the rate) of the whole run. The same workload and seed still give the same run, which is all the seed's help claims.

**The defaults** are 60 s, seed 42, an empty mix, and one profile point: 0 s at 100 requests/s. `addWorkload` is the only place that writes them, as named constants (`NEW_WORKLOAD_DURATION_MS`, …). They're the editor's choices, an assumption, not a claim about any system.

**A new workload is complete at once.** A new workflow has to wait as a draft, because a workflow can't be stored without a first step. A workload can be stored with an empty mix: that's a run issue, not an error in the stored document, and it stops only a run of that workload ([UX design §8](../design/user-experience.md#8-workloads), "Problems"). So "Add workload" saves and selects it in one event, and its empty-mix issue shows on its list row, in Details, and in the bar, where the user can see why Run waits. Nothing is held in the UI.

**The name field** ([`WorkloadNameField`](../../src/ui/project/fields/WorkloadNameField.tsx)) is a draft like a workflow's: `useDraft`, `TextField`, and the check `checkWorkloadName` on every render, since the other workloads' names are in the project. It uses the same `nameKey` as the workflow and project names, so "lunch rush" can become "Lunch rush" and another workload's name is refused in any case. Enter or leaving the field saves; Escape puts the saved name back; a bad name stays in the field, `aria-invalid`, with its message in `aria-describedby`. After "Add workload" the field takes the focus with its text selected, as a new component's does.

**Remove** in Details' header asks first, with the focus on Cancel ("Remove Lunch rush?", worded by `workloadRemovalText`, with no warning: a workload's remove takes nothing but itself). Confirming does all of this in one event:

```mermaid
sequenceDiagram
    actor User
    participant D as Details header (ui)
    participant R as useRevealingRemove (ui)
    participant A as useAddAndRemove (ui)
    participant E as useProjectEdits (ui)
    participant P as useProjectRun (ui)
    User->>D: Remove
    D->>User: "Remove Lunch rush?" with the focus on Cancel
    User->>D: Remove (confirms)
    D->>R: remove({ kind: "workload", workloadId })
    R->>R: opens the Workflows panel, so Add workload is there to take the focus
    R->>P: pick(workloadAfterRemoval): the next in the list, else the one before, else none
    R->>A: remove(target)
    A->>E: edit(removeWorkload), named "Remove workload Lunch rush"
    E->>E: history keeps the record before; the screen shows the next; the run on screen is compared with it
    A->>A: clear the selection, focus Add workload
    A-->>User: "Removed Lunch rush." from the region beside the panel buttons
```

- **Why undo brings it back whole.** The history step holds the whole record from before the remove, so Undo puts back the workload with its mix and profile at its place in the list; `removeWorkload` has no inverse to get wrong. `selectionAfterUndo` then selects it, which picks it in the bar.
- **The next pick.** `workloadAfterRemoval` reads the list as it was, before the edit: the workload after the removed one, or the one before if it was last, or none. With none left, the bar says "This project has no workloads to run."
- **The run.** A run of the removed workload stays on screen, out of date: `runIsCurrent` compares the workload the run used, and the project no longer has it. Renaming or removing the workload that ran makes the run out of date; changing any other workload doesn't, and neither does adding one, since no workload a run used has changed.
- **Where the announcement is said.** "Add workload" is in the "Workflows" panel, which may be closed, and a live region in a hidden panel says nothing. So a workload's remove, like a workflow's, is announced from the one region beside the panel buttons, which always show, not from beside "Add workload".

## Worked example

[`workload-details.txt`](../../src/adapters/templates/details/workload-details.txt) is each template's workloads as Details shows them, and a stored workload broken by hand: Template A's "Steady day" with an empty mix and a run cut to 30 s. A test writes the file and fails when it goes stale (refresh it with `npx vitest run src/adapters/templates/details --update`). Its last block:

```text
Steady day, broken
Duration: 30 seconds. Seed: 42.
Mix
  No workflows in the mix. A workload with an empty mix can't run.
Profile (time in s, rate in requests/s)
  0  200
  60  200
    After the run's end (30 s). Arrivals follow the line toward this point, and the run stops at 30 s.
```
