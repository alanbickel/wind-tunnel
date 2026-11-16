/** The elements the focus can go to, nearest first, and which are there. */
function candidatesOf(list: HTMLElement): (HTMLElement | null)[] {
  const panel = list.closest<HTMLElement>('[role="tabpanel"]');
  const tabId = panel?.getAttribute("aria-labelledby");
  const panelsId = panel?.parentElement?.id;
  return [
    list,
    tabId ? document.getElementById(tabId) : null,
    panelsId
      ? document.querySelector<HTMLElement>(`[aria-controls="${panelsId}"]`)
      : null,
  ];
}

/**
 * Moves the focus to the Components tab's list after a remove (UX design
 * §5). A remove never changes the dock's tab or unfolds it, so the list may
 * be hidden: then the Components tab takes the focus, and when the dock is
 * folded and the tabs are hidden too, the button that unfolds it.
 */
export function focusComponentsList(list: HTMLElement | null): void {
  if (list === null) return;
  const target = candidatesOf(list).find(
    (element) => element !== null && element.closest("[hidden]") === null,
  );
  target?.focus();
}
