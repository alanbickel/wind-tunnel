import type { ReactNode } from "react";

/**
 * The tool rail's icons, drawn here as simple strokes in `currentColor`.
 * Decorative: each button names itself, so the icon is hidden from screen
 * readers. Sized by the button's `--icon-size` rule.
 */
function RailIcon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Two boxes joined by a line: connect them. */
export function ConnectIcon() {
  return (
    <RailIcon>
      <rect x="2" y="3" width="8" height="8" rx="2" />
      <rect x="14" y="13" width="8" height="8" rx="2" />
      <path d="M10 7h4a2 2 0 0 1 2 2v4" />
    </RailIcon>
  );
}
