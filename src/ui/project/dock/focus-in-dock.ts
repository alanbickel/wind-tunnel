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
 * Moves the focus to where a remove sends it in the dock (UX design §5):
 * the Components tab's list, or the Workloads tab's "Add workload". A
 * remove never changes the dock's tab or unfolds it, so the element may be
 * hidden: then its tab takes the focus, and when the dock is folded and
 * the tabs are hidden too, the button that unfolds it.
 */
export function focusInDock(element: HTMLElement | null): void {
  if (element === null) return;
  const target = candidatesOf(element).find(
    (element) => element !== null && element.closest("[hidden]") === null,
  );
  target?.focus();
}
