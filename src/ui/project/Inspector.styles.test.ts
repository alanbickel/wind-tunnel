import { describe, expect, it } from "vitest";
import inspectorCss from "./Inspector.module.css?raw";

/** The declarations of the rule whose selector is exactly `selector`. */
function declarationsOf(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`No rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("the inspector's stylesheet", () => {
  // Fails if the scrolling body loses its position, so a visually hidden
  // region inside it, such as the Details' announcement, takes the page as
  // its containing block and, below the window's edge, makes a wide
  // window's page scroll (#279).
  it("makes the scrolling body the containing block of what's inside it", () => {
    const body = declarationsOf(inspectorCss, ".body:not([hidden])");

    expect(body).toMatch(/\bposition: relative;/);
    expect(body).toMatch(/\boverflow: auto;/);
  });

  // Fails if the run's explanation loses the bar that marks Details, a
  // selected box, and a selected row (UX design §5, #279).
  it("draws the selection's bar down the run's explanation", () => {
    expect(declarationsOf(inspectorCss, ".run")).toMatch(
      /border-inline-start: var\(--selection-bar-width\) solid var\(--color-text\);/,
    );
  });
});
