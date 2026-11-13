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

/** A box with a plus: add a component. */
export function AddComponentIcon() {
  return (
    <RailIcon>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </RailIcon>
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

/** Three steps along a path: a workflow. */
export function WorkflowsIcon() {
  return (
    <RailIcon>
      <circle cx="5" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M6.5 7.5 10.5 16.5M13.5 16.5l4-9" />
    </RailIcon>
  );
}

/** A rising line of traffic: a workload. */
export function WorkloadsIcon() {
  return (
    <RailIcon>
      <path d="M3 20h18" />
      <path d="M4 16l5-5 4 3 7-8" />
      <path d="M15 6h5v5" />
    </RailIcon>
  );
}
