// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  openPanel,
  panelButton,
  railRegion,
  revealButton,
} from "./testing/canvas-panels";
import {
  bar,
  clickRun,
  detailsHeading,
  inspector,
  renderOpenedProject as renderProject,
  runExplanation,
} from "./testing/render-opened-project";

/** The inspector's one button that closes and opens it. */
function inspectorToggle(): HTMLElement {
  return within(inspector()).getByRole("button", {
    name: /^(Close|Open) the inspector$/,
  });
}

/** The inspector's content, which its toggle shows and hides. */
function inspectorBody(): HTMLElement {
  const id = inspectorToggle().getAttribute("aria-controls") ?? "";
  const body = document.getElementById(id);
  if (body === null) throw new Error("the toggle should control the body");
  return body;
}

/** Whether the inspector is open, its content shown. */
function inspectorShown(): boolean {
  return !inspectorBody().hidden;
}

describe("OpenedProject's canvas-first layout", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the project's name and controls leave the top bar, or the
  // canvas and the inspector stop being under it, in that order.
  it("puts the project in one top bar, over the canvas and the inspector", () => {
    renderProject();
    const inBar = within(bar());

    expect(inBar.getByRole("heading", { level: 1 }).textContent).toBe(
      "Wind Tunnel",
    );
    expect(
      within(inBar.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
        "heading",
        { level: 2, name: "Sample project" },
      ),
    ).toBeTruthy();
    for (const name of [
      "Rename Sample project",
      "Undo",
      "Redo",
      "Run",
      "Stop",
    ]) {
      expect(inBar.getByRole("button", { name })).toBeTruthy();
    }
    const canvas = screen.getByRole("region", { name: "Architecture" });
    for (const under of [canvas, inspector()]) {
      expect(bar().contains(under)).toBe(false);
      expect(
        bar().compareDocumentPosition(under) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(
      canvas.compareDocumentPosition(inspector()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Fails if the app mark stops being drawn before the name, or stops being
  // hidden from assistive technology (`aria-hidden` removed from `AppMark`).
  it("draws the app mark before the name, hidden from screen readers", () => {
    renderProject();
    const name = within(bar()).getByRole("heading", { level: 1 });

    const mark = name.previousElementSibling;

    expect(mark?.tagName.toLowerCase()).toBe("svg");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  // Fails if the description stays in the bar, leaves the top of the
  // inspector before any run, the inspector has tabs, or the description
  // shows over a selection's details.
  it("shows the description at the top of the inspector before any run, without tabs", () => {
    renderProject();
    expect(within(bar()).queryByText("A small project for tests.")).toBeNull();

    const [first] = within(inspector()).getAllByText(/./, { selector: "p" });
    expect(first?.textContent).toBe("A small project for tests.");
    expect(within(inspector()).getByText(/^Nothing selected\./)).toBeTruthy();
    expect(within(inspector()).queryByRole("tablist")).toBeNull();

    fireEvent.click(revealButton("Function (Lambda)"));
    expect(
      within(inspector()).queryByText("A small project for tests."),
    ).toBeNull();
  });

  // Fails if a narrow window loses the description before any run, or
  // shows the inspector in tabs.
  it("shows the description in a narrow window's inspector, without tabs", () => {
    renderProject({ width: "narrow" });

    expect(inspector().textContent).toContain("A small project for tests.");
    expect(within(inspector()).queryByRole("tablist")).toBeNull();
  });
});

describe("OpenedProject's inspector", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Close doesn't collapse the inspector, the strip has no way
  // to open it again, or the focus leaves the button either way.
  it("collapses on Close to a strip, and opens again from it", () => {
    renderProject();
    const toggle = inspectorToggle();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.focus();

    fireEvent.click(toggle);

    expect(inspectorShown()).toBe(false);
    expect(inspectorToggle()).toBe(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Open the inspector");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);

    expect(inspectorShown()).toBe(true);
    expect(toggle.getAttribute("aria-label")).toBe("Close the inspector");
    expect(document.activeElement).toBe(toggle);
  });

  // Fails if selecting leaves a collapsed inspector closed, or opens it
  // without moving the focus to Details' heading.
  it("opens on a selection, with the focus on Details' heading", () => {
    renderProject();
    fireEvent.click(inspectorToggle());

    revealButton("Function (Lambda)").focus();
    fireEvent.click(revealButton("Function (Lambda)"));

    expect(inspectorShown()).toBe(true);
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if Run leaves a collapsed inspector closed.
  it("opens on Run", () => {
    renderProject();
    fireEvent.click(inspectorToggle());

    clickRun();

    expect(inspectorShown()).toBe(true);
  });

  // Fails if the run's explanation is unmounted while the inspector is
  // collapsed, which would drop its open explanations.
  it("keeps its content mounted, hidden, while collapsed", async () => {
    const { runner } = renderProject();
    clickRun();
    await runner.finish();
    const explanation = runExplanation();

    fireEvent.click(inspectorToggle());

    expect(explanation.isConnected).toBe(true);
    expect(explanation.closest("[hidden]")).not.toBeNull();
  });
});

describe("OpenedProject's Workflows panel and a workflow's remove", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a workflow's remove leaves the Workflows panel closed, so
  // the focus can't land on "Add workflow" and falls to the page, or says
  // what it removed from a region inside the panel, hidden until the
  // remove reveals it, so a screen reader may not announce it.
  it("opens Workflows to put the focus on Add workflow", () => {
    renderProject();
    const workflows = openPanel("Workflows");
    const region = railRegion("list");
    fireEvent.click(revealButton("Read item"));
    fireEvent.click(workflows);
    expect(screen.queryByRole("region", { name: "Workflows" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const asking = screen.getByRole("group", { name: "Remove Read item?" });
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));

    expect(workflows.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add workflow" }),
    );
    expect(region.closest("[hidden]")).toBeNull();
    expect(region.textContent).toBe("Removed Read item.");
  });

  // Fails if Escape in Details returns the focus to a button in a canvas
  // panel closed since it made the selection without opening the panel,
  // so in a browser the focus falls to the page.
  it.each([
    ["As text", "Function (Lambda)", "Workflows"],
    ["Workflows", "Read item", "As text"],
  ] as const)(
    "opens %s again when Escape returns the focus to %s in it",
    (panel, name, other) => {
      renderProject();
      const button = revealButton(name);
      button.focus();
      fireEvent.click(button);
      openPanel(other);
      expect(button.closest("[hidden]")).not.toBeNull();

      fireEvent.keyDown(detailsHeading(), { key: "Escape" });

      expect(panelButton(panel)?.getAttribute("aria-expanded")).toBe("true");
      expect(button.closest("[hidden]")).toBeNull();
      expect(document.activeElement).toBe(button);
    },
  );
});
