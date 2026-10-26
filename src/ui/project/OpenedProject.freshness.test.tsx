// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  clickRun,
  renderOpenedProject as renderProject,
  status,
  statusRegions,
} from "./testing/render-opened-project";

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

/** A second of the sample run in which the table throttles a read. */
function throttledSecond(second: number) {
  return sampleSnapshot({
    second,
    read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
    table: { arrivals: 1, rejected: 1 },
  });
}

const EARLIER_VERSION =
  "This run is of an earlier version of the project. Run again to see your changes.";

function runTab(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Run" });
}

describe("OpenedProject's run when the project changes", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if useRunFindings words the findings from the project as it is
  // now, not the run's copy: they would read "Orders".
  it("words the run's findings from the project it ran", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(throttledSecond(1));
    await runner.finish();
    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);

    change(withTableNamed("Orders"));

    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);
    expect(within(runTab()).queryByText(/Orders/)).toBeNull();
  });

  // Fails if a change to the project after a run doesn't mark it out of
  // date in the bar and the Run tab, or the findings go with it.
  it("says the run is out of date, and keeps its findings", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(throttledSecond(1));
    await runner.finish();
    expect(within(runTab()).queryByText(EARLIER_VERSION)).toBeNull();

    change(withTableNamed("Orders"));

    expect(statusRegions()[1].textContent).toBe("Out of date");
    expect(within(runTab()).getByText(EARLIER_VERSION)).toBeTruthy();
    expect(status()).toBe("Finished Steady. Failing so far.");
    expect(
      within(runTab()).getByRole("heading", { name: "Failing so far" }),
    ).toBeTruthy();
  });

  // Fails if the run picks up the changed project while it runs (the
  // later throttle would be worded "Orders"), or isn't shown out of date
  // until it ends.
  it("shows a run out of date as soon as the project changes, and finishes it with its copy", async () => {
    const { runner, change } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1, read: { started: 1 } }));

    change(withTableNamed("Orders"));
    expect(statusRegions()[1].textContent).toBe("Out of date");
    runner.send(throttledSecond(2));
    await runner.finish();

    expect(status()).toBe("Finished Steady. Failing so far.");
    expect(within(runTab()).queryAllByText(/Table/).length).toBeGreaterThan(0);
    expect(within(runTab()).queryByText(/Orders/)).toBeNull();
  });

  // Fails if the out-of-date region mounts with its text (screen readers
  // skip a region that appears with its text in it), its text isn't "Out
  // of date", or the change moves the focus.
  it("announces it from a region that was there, empty, before", async () => {
    const { runner, change } = renderProject();
    const [, region] = statusRegions();
    expect(region.textContent).toBe("");
    clickRun();
    await runner.finish();
    expect(region.textContent).toBe("");
    const run = screen.getByRole("button", { name: "Run" });
    run.focus();

    change(withTableNamed("Orders"));

    expect(statusRegions()[1]).toBe(region);
    expect(region.textContent).toBe("Out of date");
    expect(document.activeElement).toBe(run);
  });

  // Fails if freshness is a count of changes, not a comparison: changing
  // the project back would leave the run out of date.
  it("is current again once the project changes back", async () => {
    const { runner, change } = renderProject();
    clickRun();
    await runner.finish();
    change(withTableNamed("Orders"));

    change(withTableNamed("Table"));

    expect(statusRegions()[1].textContent).toBe("");
    expect(within(runTab()).queryByText(EARLIER_VERSION)).toBeNull();
  });
});
