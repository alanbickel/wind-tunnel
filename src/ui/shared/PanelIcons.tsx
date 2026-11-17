import type { ReactNode } from "react";

/** What a panel icon draws. */
interface PanelIconProps {
  readonly children: ReactNode;
}

/**
 * A panel's icons (× and the chevron), drawn as simple strokes in
 * `currentColor`. Decorative: each button names itself, so the icon is
 * hidden from screen readers. Sized by the button's `--icon-size` rule.
 */
function PanelIcon({ children }: PanelIconProps) {
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

/** An ×: clear what's shown. */
export function CloseIcon() {
  return (
    <PanelIcon>
      <path d="M6 6l12 12M18 6 6 18" />
    </PanelIcon>
  );
}

/** A chevron pointing right: a panel on the right collapses that way. */
export function ChevronRightIcon() {
  return (
    <PanelIcon>
      <path d="m9 6 6 6-6 6" />
    </PanelIcon>
  );
}

/** A chevron pointing left: a collapsed panel on the right opens that way. */
export function ChevronLeftIcon() {
  return (
    <PanelIcon>
      <path d="m15 6-6 6 6 6" />
    </PanelIcon>
  );
}
