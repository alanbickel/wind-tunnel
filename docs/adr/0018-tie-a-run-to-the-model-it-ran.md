# ADR-0018: Tie a run to the model it ran

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Until M6, a project couldn't change while it was open, so a run on screen always matched the project. M6 lets the user edit a project and run it again in one sitting ([user experience design §1](../design/user-experience.md#1-the-modeling-loop)), and the run on screen may then be of an earlier version.

Today nothing ties a run to what it ran. `useSimulationRun` keeps the latest run's workload and snapshots in memory. `useRunFindings` works out the findings from those snapshots and words them with the project *as it is now*: the phrasebook looks up each component's type in the current project to find the type's wording (ADR-0015). After an edit, an old run's findings would be worded against a different project, and a component removed since would have no type to word it.

The screen also has to say when the run no longer matches the project, and the user can undo, so the project can return to exactly what ran ([§4.2](../design/user-experience.md#42-run-freshness)).

## Decision

1. **A run keeps the model it ran.** Starting a run copies the project. Everything shown about the run reads that copy: the findings and their wording, the totals, and the diagram's status dots.
2. **A run is current while what it ran is unchanged, compared by content.** What counts is what changes a run's results: the architecture, the workflows, and the workload that ran. The project's name and description, the diagram's layout, and the other workloads don't count. There's no revision number: undoing back to what ran makes the run current again.
3. **Runs aren't stored.** As today, the screen keeps its latest run until the user leaves it. The project document doesn't change.

## Consequences

- An old run reads the same however the project changes, and a finding can still name a component that's since been removed.
- The run's phase gains the project copy. A project is small, so copying it and comparing two by content cost little next to the run itself.
- No document change and no migration.
- The comparison says only *whether* the project changed, not what changed. Saying what changed ("you changed orders-db's query workers") is the start of comparing runs, which isn't scheduled; a revision number or a stored run can be added for it then without changing this decision.
- A rename of a component counts as a change, because names are part of the architecture, even though it changes no number. That's the simpler rule, and once findings word components by name ([§5](../design/user-experience.md#5-data-needs)), a rename changes what the run's report would say.
