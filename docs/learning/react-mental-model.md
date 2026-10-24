# React: Mental Model and Pitfalls

React behaviors that surprise someone new to it, collected while building Wind Tunnel. Each entry has the surprise, why React works that way, the fix, where it shows up in this codebase, and a source on react.dev.

The model underneath most of them: **a component is a function from props and state to UI.** On any state change, React calls the function again, compares the new output with the last, and changes only the DOM that differs. React doesn't track which values a component reads; it re-runs the component and diffs the result.

---

### `useState(fn)` runs `fn` once; it doesn't subscribe to it

Passing a function to `useState` makes it an _initializer_: React calls it on the first render and keeps the result as the initial state. It never calls it again, and nothing about the function is reactive. `useState(fn())` behaves the same, but calls `fn` on every render and throws the result away after the first.

**Why it bites:** coming from signals (Solid, Vue), a function looks like something React will watch. State changes only through its setter.
**Fix:** pass the function, not its result, when the initial value is costly or reads the outside world (storage, parsing).
**In Wind Tunnel:** the theme control reads the saved theme from `localStorage` this way ([#37](https://github.com/alanbickel/wind-tunnel/pull/37)).
**Source:** [Avoiding recreating the initial state](https://react.dev/reference/react/useState#avoiding-recreating-the-initial-state). In Strict Mode, React calls initializers twice in development to catch impure ones.

### A state change re-renders the component and everything under it

When a component's state changes, React re-renders it and, recursively, every component it renders, whether or not their props changed. A re-render is a function call and a diff, not DOM work: React touches only the DOM nodes that differ.

**Why it bites:** state high in the tree that changes often (a hover, a keystroke, a pointer position) makes everything below it re-render on each change.
**Fix:** see the next two entries before reaching for `memo`.
**In Wind Tunnel:** each run snapshot, several a second, re-renders the project screen, which holds the run: the project bar, the Run tab's tables, and four charts. `OpenedProject` memoizes the architecture's element, so the diagram doesn't redraw. Fine at today's sizes; the first place to watch as the run screen grows.
**Source:** [Render and commit](https://react.dev/learn/render-and-commit)

### `memo` is an optimization, not state management: move state down first

`memo` skips re-rendering a component whose props haven't changed. Wrapping components in it to stop a volatile parent re-rendering them treats the symptom. react.dev's own advice is to keep state as low in the tree as it's needed ("don't keep transient state like forms and whether an item is hovered at the top of your tree"), and to let wrapper components take their content as `children`, which don't re-render when the wrapper's state changes.

**Why it bites:** `memo` breaks silently when a prop is a new object or function on each render, so a codebase that leans on it needs `useMemo` and `useCallback` everywhere to keep it working. React Compiler adds that memoization automatically at build time.
**Fix:** put state in the component that uses it; pass content as `children`; memoize only what you've measured.
**Source:** [`memo`: Should you add memo everywhere?](https://react.dev/reference/react/memo#skipping-re-rendering-when-props-are-unchanged)

### Keep fast-changing values out of React state

A value that changes on every frame, like a drag position, shouldn't be React state at all: each change would re-render. Keep it in a ref or an external store and update the DOM directly (a CSS transform), committing to state only when the gesture ends. Where a component needs a slice of a store, it subscribes to just that slice, which brings back fine-grained updates from outside React.

**In Wind Tunnel:** React Flow keeps nodes and edges in its own store, and each node subscribes to its own part, so dragging one node doesn't re-render the others. Our `Diagram` wrapper never sees that machinery.
**Source:** [Referencing values with refs](https://react.dev/learn/referencing-values-with-refs), [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)

### A context change re-renders every component that reads it

When a context provider's `value` changes (compared with `Object.is`), every component under it that reads the context re-renders, and `memo` doesn't stop it. A provider whose value is a new object on each render re-renders all its readers every time.

**Fix:** keep a context's value stable (`useMemo`), split contexts that change at different rates, and keep things the browser can do itself out of React.
**In Wind Tunnel:** the theme is CSS custom properties, not a context. Changing it sets one attribute on `<html>`, and the browser re-resolves every `var()` without React re-rendering anything ([ADR-0012](../adr/0012-style-the-ui-with-css-tokens-and-css-modules.md)).
**Source:** [`useContext` caveats](https://react.dev/reference/react/useContext#caveats)

### State is a snapshot: it changes on the next render, not now

Calling a setter doesn't change the variable in the code that's running; the new value arrives on the next render. Two clicks before React re-renders both see the old state.

**Fix:** to make sure something runs once, guard it with a `useRef`, which changes immediately.
**In Wind Tunnel:** `useCreateFromTemplate`, `useSimulationRun`, and `useStoragePersistence` guard with refs so a double click can't start two creates or two runs.
**Source:** [State as a snapshot](https://react.dev/learn/state-as-a-snapshot)

### A function created during render is a new function every render

Functions and objects written inside a component are recreated on every render, so an effect that depends on one re-runs every render too.

**Fix:** wrap the function in `useCallback` (or the object in `useMemo`) with the values it depends on, or define it outside the component.
**In Wind Tunnel:** `useLoad(load)` runs `load` when it changes, so each screen wraps `load` in `useCallback`; without it, a screen would reload on every render ([UI guide](../architecture/user-interface.md#patterns-youll-see)).
**Source:** [`useCallback`](https://react.dev/reference/react/useCallback)
