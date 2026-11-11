import type { ComponentType } from "react";

/** An icon that draws an SVG `size` wide and tall. */
export type Icon = ComponentType<{ readonly size?: string | number }>;

/**
 * An icon as an import gives it. react-aws-icons is CommonJS with an
 * `__esModule` flag, and the production build hands a default import of it
 * over as the module object, `{ default: Icon }`, where Vitest hands over the
 * component. Both are accepted, since only one is seen in each place.
 */
export type ImportedIcon = Icon | { readonly default: Icon };

/** The icon itself, whichever way the import gave it. */
export function iconOf(imported: ImportedIcon): Icon {
  return "default" in imported ? imported.default : imported;
}
