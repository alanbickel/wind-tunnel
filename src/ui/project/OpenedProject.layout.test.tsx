// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project } from "../../domain/model/project";
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
  overview,
  queryDetailsHeading,
  queryRunExplanation,
  renderOpenedProject as renderProject,
  status,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

/** The sample project with its first workload renamed, which a run used. */
function withWorkloadRenamed(): Project {
  const [first, ...rest] = sampleRecord.project.workloads;
  if (first === undefined) throw new Error("the sample has a workload");
  const workloads = [{ ...first, name: "Steady, renamed" }, ...rest];
  return { ...sampleRecord.project, workloads };
}

/** The inspector's one button that closes and opens it. */
function inspectorToggle(): HTMLElement {
  return within(inspector()).getByRole("button", {
    name: /^(Close|Open) the (inspector|details|run)$/,
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

  // Fails if the project's name and controls leave the top bar, the run's
  // stay in it in a wide window, or the canvas and the inspector stop
  // being under it, in that order.
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
    for (const name of ["Rename Sample project", "Undo", "Redo"]) {
      expect(inBar.getByRole("button", { name })).toBeTruthy();
    }
    expect(inBar.queryByRole("button", { name: "Run" })).toBeNull();
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

  // Fails if anything about the run comes back to a wide window's top bar
  // after a run: its status or "Out of date" (the status line that was
  // under the bar's row), or the verdict. Undo's region is the bar's only one.
  it("keeps the run out of the top bar after a run", async () => {
    const { runner, change } = renderProject();
    clickRun();
    await runner.finish();
    change(withWorkloadRenamed());
    // The run has said all it will, somewhere: it's finished, and out of date.
    expect(status()).toMatch(/^Finished Steady./);
    expect(statusRegions()[1].textContent).toBe("Out of date");

    const inBar = within(bar());
    expect(inBar.getAllByRole("status")).toEqual([undoneRegion()]);
    expect(inBar.queryByRole("button", { name: /Show the run/ })).toBeNull();
    expect(bar().textContent).not.toMatch(/Finished|Out of date|so far/);
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

  // Fails if Close, with a selection shown, collapses the inspector or
  // keeps the selection, so the overview doesn't come back, brings back
  // the run's explanation instead, or doesn't return the focus to what
  // made the selection.
  it("clears a selection on Close, keeping the inspector open", async () => {
    const { runner } = renderProject();
    clickRun();
    await runner.finish();
    const button = revealButton(/^Function \(Lambda\)/);
    button.focus();
    fireEvent.click(button);
    const toggle = within(inspector()).getByRole("button", {
      name: "Close the details",
    });

    fireEvent.click(toggle);

    expect(inspectorShown()).toBe(true);
    expect(queryDetailsHeading()).toBeNull();
    expect(overview().isConnected).toBe(true);
    expect(queryRunExplanation()).toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Close the inspector");
    expect(document.activeElement).toBe(button);
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

  // Fails if the inspector's content is unmounted while it's collapsed,
  // which would drop what it has open. With the run selected, Close
  // clears it, so only the overview can be collapsed for now (slice 6 of
  // #246 gives the inspector a chevron of its own).
  it("keeps its content mounted, hidden, while collapsed", async () => {
    const { runner } = renderProject();
    clickRun();
    await runner.finish();
    fireEvent.click(inspectorToggle());
    const shown = overview();

    fireEvent.click(inspectorToggle());

    expect(shown.isConnected).toBe(true);
    expect(shown.closest("[hidden]")).not.toBeNull();
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
  it("opens Workflows again when Escape returns the focus to Read item in it", () => {
    renderProject();
    const button = revealButton("Read item");
    button.focus();
    fireEvent.click(button);
    fireEvent.click(openPanel("Workflows"));
    expect(button.closest("[hidden]")).not.toBeNull();

    fireEvent.keyDown(detailsHeading(), { key: "Escape" });

    expect(panelButton("Workflows")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(button.closest("[hidden]")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
