# ADR-0019: Edit projects with commands, and save each change

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Until M6, a project came from a template and was never edited. M6 lets the user build and change their own ([user experience design](../design/user-experience.md)). How edits reach storage is hard to reverse: it decides what a stored project may contain, what opening one must accept, and what every editor in M6 is built on.

Today:

- `ProjectRepository.save` stores a record as given. Validation (`findProjectIssues`) runs only when a project is opened, and a project that fails it can't be opened. So an invalid save would lock the user out of their own project.
- `findProjectIssues` checks everything as one: the components and their settings, the edges, the workflows' steps, and the workloads' mixes and profiles.
- A workflow step's call must follow an edge, and a workload's mix must name at least one workflow.

The design's journeys ([§2](../design/user-experience.md#2-journeys)) showed that one rule for everything doesn't fit. Removing a component that steps still call would have to remove those steps, or be refused; removing a project's last workflow would leave a workload with an empty mix, which can't be saved. The maintainer's view, agreed on 2026-10-24: the architecture and the workflows are different things, and are validated apart.

## Decision

1. **Each change is a command, validated and saved at once.** A command is a plain function in `application/` that takes the project record and returns the next one, doing the whole change. There's no Save button. A new use case saves an edited record: it checks the architecture, refuses a record that fails, stamps `updatedAt`, and saves.
2. **The architecture is always valid; workflows and workloads may have issues.** The architecture is the components, their settings, their names (unique among the components of each type), and the edges. A change that would make it invalid doesn't save, and the screen stops it earlier: a field holds what's typed as a draft until it passes the field's checks. Workflow and workload issues, such as a step that calls a removed component or a missing edge, or a workload with an empty mix, are saved with the project. They show where they are and stop a run of the workloads they affect. Opening a project accepts them.
3. **A remove takes only what it owns.** Removing a component removes it and its edges, never workflow steps; the confirmation names the steps that call it. Removing a step removes the calls under it and its async work. Removing a workflow removes its entries in the workloads' mixes.
4. **Edges belong to the architecture.** They're drawn, edited, and removed on their own, and kept whether or not a step uses them. Adding a call along a missing edge adds the edge, as a shortcut.
5. **Undo is in memory.** Each saved command is one undo step, including everything a remove took: undoing a workflow's removal brings back its entries in the mixes too. Undo and Redo save the record before or after it. The history lasts while the project is open.

## Consequences

- Nothing invalid in the architecture is ever stored, so an edit can't lock the user out of a project.
- `findProjectIssues` splits into architecture checks and run checks. The run checks move from refusing a project to describing it, and `RunSimulation` checks the workload it's asked to run. Opening accepts more than today, so no stored project stops opening.
- A project can be saved but not runnable. The screen has to show why, wherever the issue is, and the run controls have to say which workloads can't run.
- Commands are pure functions over the record, so each is tested without a UI or a database, and undo needs only the records before and after.
- Editing a component no longer touches the workflows. To swap a database, the user points the steps at the new one before or after removing the old ([§2.4](../design/user-experience.md#24-add-a-component-and-remove-one)); in between, the workflows can't run. A "replace" command could do both at once later.
- Undo doesn't survive leaving the project. A stored history would need its own design.
