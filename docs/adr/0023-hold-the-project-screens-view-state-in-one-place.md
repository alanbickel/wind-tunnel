# ADR-0023: Hold the project screen's view state in one place, and give each region one job

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

By the end of [#213](https://github.com/alanbickel/wind-tunnel/issues/213), the project screen's view state was held in five places, each with its own hook or component, and tied together by effects and derived requests rather than by rules:

- `useSelection` held the selection, and whether the inspector was open. Selecting a workload closed the inspector, and the inspector's Close cleared the selection or collapsed the inspector, depending on what it showed.
- `Dock` held which tab showed and whether it was folded, and `useDockRequests` watched the selection to ask it for a workload's tab, so the workload's tab came and went with the selection.
- `useProjectRun` held the workload Run runs, and `usePickSelectedWorkload` followed a workload's selection into it with an effect.
- `useCanvasPanels` held which floating panel was open, and a remove opened one so the focus had somewhere to go.

What the inspector showed depended on the selection, whether there was a run, and what the dock had open. Using the app, the maintainer found the run in two places, its explanation and a component's details excluding each other, no visible way back to the run, and the dock changing the inspector ([#246](https://github.com/alanbickel/wind-tunnel/issues/246)). The same screen also had a workload reachable from three places, workflows from two, and four ways to close a panel. No one place could say what state the screen was in, so nothing could test that it moved between states consistently.

## Decision

1. **Each region of the screen has one job** ([UX design §2](../design/user-experience.md#2-the-screen)): the top bar says where you are; the banner shows problems that affect the whole project; the rail holds the canvas's view; the inspector shows the one selected thing; the dock holds the project's lists and editors and the run, in the tabs Library, Components, Workflows, Workloads, and Run. Nothing floats over the canvas but the rail.
2. **The run is selectable.** It's one of the selection's kinds, as a finding already was, and Run selects it. With nothing selected, the inspector shows the project's overview.
3. **The run's controls are one group, in the dock's tab strip:** the workload Run runs, Run and Stop, and the verdict. They're never split; in a narrow window the group moves to the top bar whole.
4. **The screen's view state is held in one place:** the selection, whether the inspector is collapsed, the dock's tab and folding, what each dock tab has open, and the workload Run runs. It changes only through named transitions (select, clear, run, show a tab, fold, collapse, and the like), each a pure function from one state to the next. The rules in [UX design §5](../design/user-experience.md#5-selection-and-focus) are those transitions, and their tests are the map of the screen's states.
5. **No region changes another's state except through those transitions,** as §5's rules say: the selection alone decides the inspector; only the user collapses or folds; switching dock tabs changes nothing else.

## Consequences

- A tester, or a person reading the tests, can see every state the screen can be in and every way between them, without a browser. A new feature that needs the screen to move differently has to add or change a transition, where the change is visible.
- The effects that tie today's hooks together (`usePickSelectedWorkload`, `useDockRequests`'s derived requests, the inspector's two-faced Close) go, along with the floating canvas panels, the workflow picker, and "As text", whose content moves to the Components and Workflows tabs.
- The workflow outline moves from the inspector to the Workflows tab, and the run's controls from the top bar to the dock. Both are moves of existing components, but they touch many tests that find them by their place on the screen.
- Holding the state in one place means one more object that every region reads. It has to stay small and declarative, or it becomes the place every feature's special case lands; §5's map is the check on that.
- The UX design (§2, §5, and the sections that refer to them) changed in the same PR as this ADR, and [`mocks/project-screen.html`](../design/mocks/project-screen.html) shows each state. The work is built in the slices listed on #246, the first of them a move to the one state with no visible change.
