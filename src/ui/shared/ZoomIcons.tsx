import type { ReactNode } from "react";

/** The frame every zoom icon is drawn in. Decorative: its button names it. */
function Frame({ children }: { readonly children: ReactNode }) {
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

/** A magnifying glass, with a minus in its lens. */
export function ZoomOutIcon() {
  return (
    <Frame>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4M8 11h6" />
    </Frame>
  );
}

/** A magnifying glass, with a plus in its lens. */
export function ZoomInIcon() {
  return (
    <Frame>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4M8 11h6M11 8v6" />
    </Frame>
  );
}

/** Four corners, as around a picture that fits its frame. */
export function FitIcon() {
  return (
    <Frame>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </Frame>
  );
}
