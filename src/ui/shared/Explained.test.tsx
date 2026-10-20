// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Explained } from "./Explained";

function renderExplained() {
  render(
    <Explained title={<h4>Limits (run peaks)</h4>} subject="Limits">
      <p>
        Peak is the most used at once. <a href="#more">More about peaks</a>
      </p>
    </Explained>,
  );
  return screen.getByRole("button", { name: "About Limits" });
}

/** The element the control shows and hides. */
function explanation(): HTMLElement {
  const text = screen.getByText(/Peak is the most used at once/);
  const shown = text.parentElement;
  if (shown === null) throw new Error("the explanation has no container");
  return shown;
}

describe("Explained", () => {
  afterEach(cleanup);

  // Fails if the control stops being a native button (a div or span with a
  // click handler gets no tab stop, and Enter and Space don't press it), or
  // loses its name, its aria-expanded, or the link to what it controls.
  it("is a named button that says whether its explanation is open", () => {
    const control = renderExplained();

    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("type")).toBe("button");
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control.getAttribute("aria-controls")).toBe(explanation().id);
    expect(explanation().hidden).toBe(true);
  });

  // Fails if pressing the control doesn't toggle the explanation both ways,
  // or aria-expanded stops following it.
  it("shows and hides the explanation each time it's pressed", () => {
    const control = renderExplained();

    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(explanation().hidden).toBe(false);

    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(explanation().hidden).toBe(true);
  });

  // Fails if Escape is ignored inside the explanation, or closes it without
  // putting the focus back on the control, where a keyboard user left off.
  it("closes on Escape from inside the explanation, focusing the control", () => {
    const control = renderExplained();
    fireEvent.click(control);
    const link = screen.getByRole("link", { name: "More about peaks" });
    link.focus();

    fireEvent.keyDown(link, { key: "Escape" });

    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(explanation().hidden).toBe(true);
    expect(document.activeElement).toBe(control);
  });

  // Fails if a handled Escape bubbles on, so one keypress would also close
  // a dialog or panel around the explanation.
  it("keeps a handled Escape from reaching what's around it", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Explained title={<h4>Limits</h4>} subject="Limits">
          <p>Peak is the most used at once.</p>
        </Explained>
      </div>,
    );
    const control = screen.getByRole("button", { name: "About Limits" });
    fireEvent.click(control);

    fireEvent.keyDown(control, { key: "Escape" });

    expect(outer).not.toHaveBeenCalled();
  });

  // Fails if Escape is ignored on the control itself.
  it("closes on Escape from the control", () => {
    const control = renderExplained();
    fireEvent.click(control);

    fireEvent.keyDown(control, { key: "Escape" });

    expect(control.getAttribute("aria-expanded")).toBe("false");
  });
});
