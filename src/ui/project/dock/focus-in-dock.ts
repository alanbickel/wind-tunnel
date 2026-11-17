/** The elements the focus can go to, nearest first, and which are there. */
function candidatesOf(element: HTMLElement): (HTMLElement | null)[] {
  const panel = element.closest<HTMLElement>('[role="tabpanel"]');
  const tabId = panel?.getAttribute("aria-labelledby");
  const panelsId = panel?.parentElement?.id;
  return [
    element,
    tabId ? document.getElementById(tabId) : null,
    panelsId
      ? document.querySelector<HTMLElement>(`[aria-controls="${panelsId}"]`)
      : null,
  ];
}

/**
 * Moves the focus to an element that may be in the dock: where a remove
 * sends it (UX design §5), the Components tab's list, or the Workflows or
 * Workloads tab's Add button; or the row that made a selection, as ×
 * returns to it. Neither a remove nor × changes the dock's tab or unfolds
 * it, so the element may be hidden: then its tab takes the focus, and when
 * the dock is folded and the tabs are hidden too, the button that unfolds
 * it. An element outside the dock takes the focus itself.
 */
export function focusInDock(element: HTMLElement | null): void {
  if (element === null) return;
  const target = candidatesOf(element).find(
    (element) => element !== null && element.closest("[hidden]") === null,
  );
  target?.focus();
}
