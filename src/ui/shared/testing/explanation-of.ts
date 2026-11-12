/**
 * What an info control (`Explained`) opens: its explanation block, which
 * holds the help paragraph, and the paragraph's id. Throws if either is
 * missing, so a test can't pass by comparing nothing with nothing.
 */
export function explanationOf(info: HTMLElement): {
  readonly explanation: HTMLElement;
  readonly paragraphId: string;
} {
  const explanation = document.getElementById(
    info.getAttribute("aria-controls") ?? "",
  );
  const paragraph = explanation?.querySelector("p");
  if (!explanation || !paragraph?.id) {
    throw new Error(
      "The info control has no explanation with a help paragraph",
    );
  }
  return { explanation, paragraphId: paragraph.id };
}

/** The ids an element's `aria-describedby` lists. */
export function describedByIds(element: Element): string[] {
  return (element.getAttribute("aria-describedby") ?? "").split(" ");
}
