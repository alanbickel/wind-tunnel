/** The curved arrow drawn for Undo; Redo mirrors it. Decorative: its button names it. */
function CurvedArrow({ mirrored }: { readonly mirrored: boolean }) {
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
      transform={mirrored ? "scale(-1 1)" : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function UndoIcon() {
  return <CurvedArrow mirrored={false} />;
}

export function RedoIcon() {
  return <CurvedArrow mirrored />;
}
