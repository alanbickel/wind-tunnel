# ADR-0012: Style the UI with design tokens in CSS custom properties, and CSS Modules

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The UI has no stylesheet yet: browser defaults plus three inline styles (a chart's size and grey axes, the diagram's height, and a button's unavailable look). M4 makes the app presentable, and every later screen (the findings panel, the details drawer, the editors) builds on the approach chosen now.

The look we're aiming for is IcePanel's C4 diagrams: a dark canvas, crisp node cards, status dots, and rows of badges. A light theme is needed too, for people who find light text on a dark background hard to read. Every color must meet WCAG 2.2 AA: 4.5:1 for text, and 3:1 for large text, controls, focus rings, diagram edges, and chart lines.

Two parts of the UI draw with libraries that have their own styling: React Flow for the diagram ([ADR-0010](0010-draw-diagrams-with-react-flow-behind-our-own-component.md)) and Recharts for the charts ([ADR-0011](0011-draw-charts-with-recharts-behind-our-own-components.md)). Both sit behind our own components, so the theme has to reach them without consumers passing colors in.

The options considered:

- **A component kit** (MUI, Chakra, Mantine): ready-made controls, but a large dependency with its own look and its own theming system, which we'd spend our time overriding.
- **CSS-in-JS** (styled-components, Emotion): styles written in TypeScript, but a dependency that does work at runtime on every render. styled-components is in maintenance mode.
- **Tailwind:** quick to write, but utility classes fill the markup, and it brings a build plugin and a token system of its own.
- **Plain global stylesheets:** no tooling, but every class name shares one namespace, so names collide as screens grow.
- **CSS custom properties and CSS Modules:** both come with the browser and Vite, with no dependency. Custom properties hold the values and switch with the theme. CSS Modules scope class names to the component that imports them.

## Decision

Style the UI with **design tokens as CSS custom properties**, and style components with **CSS Modules**. No component kit, no CSS-in-JS, no utility framework.

**Tokens.** `src/ui/theme/tokens.css` defines every color, spacing, type size, and corner radius the UI uses. Tokens are named for their role, not their value (`--color-text-muted`, not `--grey-600`); the design tokens issue ([#29](https://github.com/alanbickel/wind-tunnel/issues/29)) picks the set. Each color token holds both themes' values, side by side, with CSS's `light-dark()` function, for example `--color-text: light-dark(#1b1b1f, #e8e8ed)`. Spacing, type sizes, and radii are the same in both themes. Color tokens are opaque, so their contrast can be computed.

**Themes.** `light-dark()` picks its value by the element's `color-scheme`, so choosing a theme sets one thing, on the `<html>` element:

- By default, `color-scheme: light dark` follows the operating system's `prefers-color-scheme` setting.
- The theme control offers System, Dark, and Light. Dark or Light sets `data-theme` on `<html>`, which fixes `color-scheme`, and saves the choice in `localStorage`. System removes both.
- At startup, the saved choice is applied before the app first renders.

Dark is the primary theme: the IcePanel look is dark, so it's designed first, and the light theme is its counterpart.

**Where styles live:** only in `src/ui/`. `src/ui/theme/` holds `tokens.css`, a base stylesheet (the page's background, text, and font, and one `:focus-visible` ring for every control), and the code that reads and saves the theme choice. The composition root (`src/main.tsx`) imports the two stylesheets once, so the startup failure screen is themed too. Each component's styles sit next to it as `Name.module.css`, and they use tokens through `var()`. Inline `style` props are only for values computed at runtime.

**React Flow and Recharts** get the tokens inside their wrapper folders. Consumers still pass only our own props, never a color.

- `src/ui/diagram/` sets React Flow's own custom properties (`--xy-background-color`, `--xy-edge-stroke`, and so on) to our tokens in its stylesheet, rather than using React Flow's `colorMode` prop. Our own node components use CSS Modules.
- `src/ui/charts/` passes token references as Recharts' color props, for example `stroke="var(--color-series-1)"`. The browser resolves them, so a theme change recolors a chart without re-rendering it.

**Checks:**

- A contrast test, added with the tokens ([#29](https://github.com/alanbickel/wind-tunnel/issues/29)), reads `tokens.css` and checks a list of token pairs in both themes. Each text color is checked against each background it's used on, at 4.5:1. Each control, focus ring, diagram edge, and chart line color is checked against its background, at 3:1. The test fails if a pair falls below its ratio, or if a color token is in no pair, so a new token can't skip the check.
- An architecture test, added with the restyled screens ([#30](https://github.com/alanbickel/wind-tunnel/issues/30)), fails if a color literal appears in `src/ui/` outside `tokens.css`, or if a stylesheet appears outside `src/ui/`. Until the charts and the diagram are themed, their current literals are listed as exceptions in the test.

## Consequences

- No new dependencies. Vite builds CSS Modules, and the browser resolves the tokens and the theme.
- Switching themes changes one attribute on `<html>`. No React state reaches every component, and nothing re-renders.
- `light-dark()` needs Chrome or Edge 123, Firefox 120, or Safari 17.5, all from 2024. In older browsers the colors fall back to the browser's defaults.
- The contrast test checks the pairs it's given. It can't see which tokens a stylesheet actually puts together, so a reviewer checks that each foreground and background a change combines is in the list.
- CSS Module class names aren't type-checked. Vite types a module as a string index, so with `noUncheckedIndexedAccess` a misspelled `styles.nodeCrad` is `undefined`, and the element silently gets no class. A plugin that generates types for CSS Modules would catch it, at the cost of a dependency.
- The chart series colors must change. Three of today's eight (aqua, yellow, pink) are below 3:1 on white, so the light theme needs its own series values, and each theme's set must keep neighboring lines distinct for color-blind readers. The table under each chart stays.
- If the saved theme differs from the operating system's, the page may show the other theme's background for a moment while the app's script loads. A few lines in `index.html` could apply the choice sooner, at the cost of a second place that knows how the choice is stored.
- React Flow's custom-property names belong to its styling API, not ours. An upgrade that renames them breaks the diagram's colors, but only inside `src/ui/diagram/`.
- ESLint can't tell a runtime inline style from a static one, so reviewers check that each `style` prop holds a computed value.
