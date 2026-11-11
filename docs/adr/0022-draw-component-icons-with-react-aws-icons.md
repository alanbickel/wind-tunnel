# ADR-0022: Draw a component type's icon with react-aws-icons

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Each box on the canvas is a card with an icon for its component type ([UX design §4](../design/user-experience.md#4-the-canvas)), so a developer can tell an API Gateway from a Lambda at a glance. Five types have icons today, and every new type needs one. The options were a few SVGs drawn here, or an icon package. The maintainer chose [`react-aws-icons`](https://www.npmjs.com/package/react-aws-icons) (MIT), which carries AWS's own service logos, over generic glyphs.

The package has costs worth knowing. It was last published in 2022 and ships no types. It's CommonJS, with one file per icon under `dist/aws/logo/`. It hardcodes each icon's colors, so they don't follow the app's theme tokens ([ADR-0012](0012-style-the-ui-with-css-tokens-and-css-modules.md)). It draws a `<title>` in each SVG, and needs `prop-types` as a peer dependency.

## Decision

Use `react-aws-icons`, and import each icon from its own file (`react-aws-icons/dist/aws/logo/Lambda`), never from the package root, so the bundle holds only the icons used.

**Only `src/ui/diagram/` imports it.** `ComponentIcon` maps a component type's ID to its icon, and draws nothing for a type with no entry, so a new type appears without one. Its icons are inside the diagram's lazy chunk ([ADR-0010](0010-draw-diagrams-with-react-flow-behind-our-own-component.md)), so the project list doesn't load them. `ComponentIcon` hides the icon from screen readers, since the card says the type in words; a type declaration for the package sits beside it (`react-aws-icons.d.ts`).

## Consequences

- A new component type needs one line in `ComponentIcon` to get its logo, if the package has one; otherwise its card has no icon.
- The icons keep AWS's colors in both themes. If one reads badly on the dark theme, the fix is in `ComponentIcon`, not the package.
- The package is unmaintained. If it breaks with a future React, replacing it means rewriting one file, since nothing else sees it.
- The diagram's chunk grows by about 15 kB (3 kB gzipped).
