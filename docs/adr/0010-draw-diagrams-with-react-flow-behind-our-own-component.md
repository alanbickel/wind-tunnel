# ADR-0010: Draw architecture diagrams with React Flow, behind our own component

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

M3 shows a project's architecture: its components as boxes, and its edges as arrows between them. Each component's position is already stored in the project's `layout` ([ADR-0004](0004-persist-projects-in-indexeddb.md), [ADR-0008](0008-ports-exchange-project-records.md)), and the bundled templates ship with one, so the view doesn't need automatic layout.

The MVP view is read-only, but later work is not: editing architectures on the canvas and animating requests along edges are both planned (MVP design §1). Pan, zoom, dragging, connecting nodes, and edge routing are a lot to build by hand.

Diagram libraries have their own node, edge, and event types. If those types spread through the UI, every screen that shows a diagram depends on the library, and replacing it (with another library, or our own SVG) means rewriting them all.

## Decision

Use [React Flow](https://reactflow.dev/) (`@xyflow/react`, MIT). Its nodes are React components, and it handles pan, zoom, editing, and animated edges.

**Only `src/ui/diagram/` imports `@xyflow/react`.** That folder exports a `Diagram` component whose props are our own types: nodes (ID, label, component type, position) and edges (ID, source, target). It converts them to React Flow's types inside. When editing arrives, it adds callbacks in our own terms (a node moved, an edge was added), not React Flow's change events.

Consumers, such as the architecture view, map a project into those props and render `<Diagram>`. They never see a React Flow type.

ESLint enforces the boundary: importing `@xyflow/react` in `src/ui/` or `src/adapters/` outside `src/ui/diagram/` is an error. (`domain/` and `application/` already reject every unapproved package.)

## Consequences

- Replacing React Flow means rewriting one folder. Consumers and their tests don't change.
- The wrapper costs some code: our own node and edge types, and a mapping in each direction once editing exists. Features we want from React Flow must be added to `Diagram`'s props first, which slows down their first use.
- `Diagram`'s props must not leak React Flow types (for example, by re-exporting its `Node`). ESLint can't see that; reviewers check it.
- React Flow adds to the bundle, and its stylesheet must be imported.

## Addendum, 2026-10-25

**Context.** M6 makes the diagram's components and edges selectable ([#85](https://github.com/alanbickel/wind-tunnel/issues/85), [UX design §4.1](../design/user-experience.md#41-selection)): a click on a box or an arrow shows its settings in the Details tab. The decision above calls the MVP view read-only and says what editing will add to `Diagram`, but not selecting, which changes nothing in the project.

**What changed.** Selecting fits the decision as written: `Diagram` gained a `selected` prop and an `onSelect` callback in our own types (`DiagramItem`: a node or an edge, by id), and the React Flow events stay inside `src/ui/diagram/`. The diagram is still read-only in the sense this ADR meant: nothing can be moved, connected, or deleted. React Flow's own selection stays off (`elementsSelectable={false}`); the diagram marks the selection it's given, so the project screen holds the one selection that the diagram, its text version, and Details share. Without `onSelect`, `Diagram` is as it was: nothing takes a tab stop or answers a click.

## Addendum, 2026-10-30

**Context.** M6 lets a user connect components by drawing on the diagram ([#96](https://github.com/alanbickel/wind-tunnel/issues/96), [UX design §2.1](../design/user-experience.md#21-model-your-own-system) step 5). The 2026-10-25 addendum said nothing on the canvas could be connected.

**What changed.** Connecting fits the decision as written, as selecting did: `Diagram` gained an `onConnect` callback in our own types (`DiagramConnection`: a source and a target node, by id), and React Flow's `onConnect` and `isValidConnection` stay inside `src/ui/diagram/`. Given `onConnect`, the boxes' handles become connectable, and the diagram refuses a drag from a box to itself or a second arrow the same way (`canConnect`) before it's reported. The diagram doesn't add the arrow itself: the project screen saves the edge, and the arrow appears when the content it's given has it. Nothing can be moved or deleted on the canvas yet; without `onConnect`, nothing can be connected.
