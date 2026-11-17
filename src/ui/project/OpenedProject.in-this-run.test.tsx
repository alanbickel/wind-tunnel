// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { addComponent, revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  dock,
  inspector,
  renderOpenedProject as renderProject,
  runExplanation,
  type RenderedProject,
} from "./testing/render-opened-project";

// UX design §9's "A component carries its part of the run", as a selected
// component's details show it; what the part holds is tested in Node, in
// `application/run-analysis/component-in-run.test.ts`.

/** A second of the sample run in which the table throttles a read. */
function throttledSecond(second: number) {
  return sampleSnapshot({
    second,
    read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
    table: { arrivals: 1, rejected: 1 },
  });
}

/** The sample project with its table component renamed to `name`. */
function withTableNamed(name: string): Project {
  const { architecture } = sampleRecord.project;
  const components = architecture.components.map((component) =>
    component.id === "table" ? { ...component, name } : component,
  );
  return {
    ...sampleRecord.project,
    architecture: { ...architecture, components },
  };
}

/** Runs the sample, the table throttling a read, to the end. */
async function renderThrottledRun(): Promise<RenderedProject> {
  const rendered = renderProject();
  clickRun();
  rendered.runner.send(throttledSecond(1));
  await rendered.runner.finish();
  return rendered;
}

/** Selects the component whose Components row starts with `name`. */
function selectComponent(name: string): void {
  fireEvent.click(revealButton(new RegExp(`^${name} \\(`)));
}

function queryInThisRun(): HTMLElement | null {
  return within(inspector()).queryByRole("region", { name: "In this run" });
}

function inThisRun(): HTMLElement {
  const found = queryInThisRun();
  if (found === null) throw new Error("In this run should be there");
  return found;
}

/** The status badge in In this run. */
function statusBadge(): Element {
  const badge = inThisRun().querySelector("[data-status]");
  if (badge === null) throw new Error("In this run should have a status");
  return badge;
}

const EARLIER_VERSION =
  "This run is of an earlier version of the project. Run again to see your changes.";

describe("OpenedProject's In this run, in a component's details", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a component's details have In this run before any run.
  it("has no In this run before the first run", () => {
    renderProject();

    selectComponent("Table");

    expect(
      within(inspector()).getByRole("region", { name: "Details" }),
    ).toBeTruthy();
    expect(queryInThisRun()).toBeNull();
  });

  // Fails if the section's status isn't the badge's (its kind, or the
  // count it refused), the findings that name the table are missing, or
  // a component no finding names lists any.
  it("ends a component's details with its status and the findings that name it", async () => {
    await renderThrottledRun();

    selectComponent("Table");

    expect(statusBadge().getAttribute("data-status")).toBe("refused");
    expect(statusBadge().textContent).toBe("refused 1 attempt");
    const findings = within(inThisRun()).getByRole("list", {
      name: "Findings that name it",
    });
    expect(within(findings).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(findings).queryByRole("button")).toBeNull();

    selectComponent("API");
    expect(statusBadge().textContent).toBe("ok");
    expect(within(inThisRun()).getByText("No finding names it.")).toBeTruthy();
  });

  // Fails if "See the run" doesn't select the run (the inspector keeps
  // the details), or doesn't show the dock's Run tab (rule 4).
  it("selects the run on See the run, and shows the Run tab", async () => {
    await renderThrottledRun();
    selectComponent("Table");
    fireEvent.click(within(dock()).getByRole("tab", { name: "Components" }));

    fireEvent.click(
      within(inThisRun()).getByRole("button", { name: "See the run" }),
    );

    expect(runExplanation()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
    expect(
      within(dock())
        .getByRole("tab", { name: "Run" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  // Fails if, after an edit, the section doesn't open with the
  // explanation's out-of-date line, or its badge isn't the hollow one's.
  it("says the run is of an earlier version, with the hollow badge, after an edit", async () => {
    const { change } = await renderThrottledRun();
    change(withTableNamed("Orders"));

    selectComponent("Orders");

    expect(within(inThisRun()).getByText(EARLIER_VERSION)).toBeTruthy();
    expect(statusBadge().hasAttribute("data-out-of-date")).toBe(true);
    expect(statusBadge().textContent).toBe(
      "refused 1 attempt, from an earlier version of the project",
    );
  });

  // Fails if a run still going lists findings, or gives no status so far.
  it("gives the status so far, and no findings, while the run goes", () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(throttledSecond(1));

    selectComponent("Table");

    expect(statusBadge().textContent).toBe("refused 1 attempt");
    expect(
      within(inThisRun()).getByText("Its findings show when the run ends."),
    ).toBeTruthy();
    expect(within(inThisRun()).queryByRole("list")).toBeNull();
  });

  // Fails if a component added since the run gets a status, or loses the
  // way back to the run.
  it("says a component added since wasn't in the run, and still links to it", async () => {
    await renderThrottledRun();

    addComponent("Lambda");

    expect(within(inThisRun()).getByText(/wasn't in this run/)).toBeTruthy();
    expect(inThisRun().querySelector("[data-status]")).toBeNull();
    expect(
      within(inThisRun()).getByRole("button", { name: "See the run" }),
    ).toBeTruthy();
  });
});
