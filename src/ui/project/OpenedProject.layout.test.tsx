// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { openPanel, revealButton } from "./testing/canvas-panels";
import {
  bar,
  clickRun,
  detailsHeading,
  renderOpenedProject as renderProject,
} from "./testing/render-opened-project";

function inspector(): HTMLElement {
  return screen.getByRole("region", { name: "Inspector" });
}

/** The inspector's one button that closes and opens it. */
function inspectorToggle(): HTMLElement {
  return within(inspector()).getByRole("button", {
    name: /^(Close|Open) the inspector$/,
  });
}

function tabList(): HTMLElement | null {
  return screen.queryByRole("tablist", { name: "Project" });
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
    for (const name of ["Rename", "Undo", "Redo", "Run", "Stop"]) {
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

  // Fails if the description stays in the bar, or leaves the Details tab,
  // or shows over a selection's details.
  it("shows the description at the top of Details while nothing is selected", () => {
    renderProject();
    expect(within(bar()).queryByText("A small project for tests.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    const details = screen.getByRole("tabpanel", { name: "Details" });
    const [first] = within(details).getAllByText(/./, { selector: "p" });
    expect(first?.textContent).toBe("A small project for tests.");

    fireEvent.click(revealButton("Function (lambda)"));
    expect(
      within(details).queryByText("A small project for tests."),
    ).toBeNull();
  });

  // Fails if a narrow window loses the description while nothing is
  // selected, or shows it in tabs.
  it("shows the description in a narrow window's Details, without tabs", () => {
    renderProject({ width: "narrow" });

    const details = screen.getByRole("region", { name: "Details" });
    expect(details.textContent).toContain("A small project for tests.");
    expect(tabList()).toBeNull();
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

    expect(tabList()).toBeNull();
    expect(inspectorToggle()).toBe(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Open the inspector");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);

    expect(tabList()).toBeTruthy();
    expect(toggle.getAttribute("aria-label")).toBe("Close the inspector");
    expect(document.activeElement).toBe(toggle);
  });

  // Fails if selecting leaves a collapsed inspector closed, or opens it
  // without moving the focus to Details' heading.
  it("opens on a selection, with the focus on Details' heading", () => {
    renderProject();
    fireEvent.click(inspectorToggle());

    revealButton("Function (lambda)").focus();
    fireEvent.click(revealButton("Function (lambda)"));

    expect(tabList()).toBeTruthy();
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if Run leaves a collapsed inspector closed.
  it("opens on Run", () => {
    renderProject();
    fireEvent.click(inspectorToggle());

    clickRun();

    expect(tabList()).toBeTruthy();
  });

  // Fails if the run's results are unmounted while the inspector is
  // collapsed, which would drop its charts.
  it("keeps the tabs mounted, hidden, while collapsed", () => {
    renderProject();
    const runTab = screen.getByRole("tabpanel", { name: "Run" });

    fireEvent.click(inspectorToggle());

    expect(runTab.isConnected).toBe(true);
    expect(runTab.closest("[hidden]")).not.toBeNull();
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
    const region = workflows.parentElement?.querySelector('[role="status"]');
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
    expect(region?.closest("[hidden]")).toBeNull();
    expect(region?.textContent).toBe("Removed Read item.");
  });

  // Fails if Escape in Details returns the focus to a button in a canvas
  // panel closed since it made the selection without opening the panel,
  // so in a browser the focus falls to the page.
  it.each([
    ["As text", "Function (lambda)", "Workflows"],
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

      expect(
        screen
          .getByRole("button", { name: panel })
          .getAttribute("aria-expanded"),
      ).toBe("true");
      expect(button.closest("[hidden]")).toBeNull();
      expect(document.activeElement).toBe(button);
    },
  );
});
