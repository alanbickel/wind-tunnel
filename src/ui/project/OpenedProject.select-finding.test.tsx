// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  renderOpenedProject as renderProject,
  type RenderedProject,
} from "./testing/render-opened-project";

/** A second of the sample run in which the table throttles a read. */
function throttledSecond(second: number) {
  return sampleSnapshot({
    second,
    read: { started: 1, failed: 1, failures: { "table: throttled": 1 } },
    table: { arrivals: 1, rejected: 1 },
  });
}

/** The sample project without its table, as an edit after the run leaves it. */
function withoutTable(): Project {
  const { architecture } = sampleRecord.project;
  return {
    ...sampleRecord.project,
    architecture: {
      components: architecture.components.filter((c) => c.id !== "table"),
      edges: architecture.edges.filter(
        (e) => e.from !== "table" && e.to !== "table",
      ),
    },
  };
}

function runTab(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Run" });
}

/** The Run tab's finding buttons, which each start with their number. */
function findingButtons(): HTMLElement[] {
  return within(runTab()).getAllByRole("button", { name: /^\d+(\.\d+)*\. / });
}

/** The first finding's button; the run's one failure, at the table. */
function firstFinding(): HTMLElement {
  const [first] = findingButtons();
  if (first === undefined) throw new Error("The run has a finding");
  return first;
}

async function drawnNode(componentId: string): Promise<Element> {
  const selector = `.react-flow__node[data-id="${componentId}"]`;
  await waitFor(() => {
    expect(document.querySelector(selector)).not.toBeNull();
  });
  return document.querySelector(selector) as Element;
}

function selectedTab(): string | null | undefined {
  return screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

/** A project that has run, with the table throttling a read. */
async function renderRun(): Promise<RenderedProject> {
  const rendered = renderProject();
  clickRun();
  rendered.runner.send(throttledSecond(1));
  await rendered.runner.finish();
  return rendered;
}

describe("OpenedProject's selected finding", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  preloadBeforeAll(() => import("../charts/ChartPlot"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a finding's button doesn't select it, the diagram's box and
  // the text version's row for its component aren't marked, or the finding
  // isn't marked current.
  it("marks the finding's component on the diagram and in the text version", async () => {
    await renderRun();
    expect(firstFinding().getAttribute("aria-current")).toBeNull();

    fireEvent.click(firstFinding());

    expect(firstFinding().getAttribute("aria-current")).toBe("true");
    expect((await drawnNode("table")).classList.contains("selected")).toBe(
      true,
    );
    expect((await drawnNode("fn")).classList.contains("selected")).toBe(false);
    const row = revealButton(/^Table \(DynamoDB\)/);
    expect(row.getAttribute("aria-current")).toBe("true");
  });

  // Fails if selecting a finding moves the focus to Details, leaves the
  // Run tab, or opens Details for it: the one selection that doesn't.
  it("keeps the focus on the finding and the inspector on the Run tab", async () => {
    await renderRun();
    firstFinding().focus();

    fireEvent.click(firstFinding());

    expect(document.activeElement).toBe(firstFinding());
    expect(selectedTab()).toBe("Run");
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByText(/^Nothing selected./)).toBeTruthy();
  });

  // Fails if Escape in the findings leaves the finding selected or moves
  // the focus off it.
  it("clears on Escape, leaving the focus on the finding", async () => {
    await renderRun();
    firstFinding().focus();
    fireEvent.click(firstFinding());

    fireEvent.keyDown(firstFinding(), { key: "Escape" });

    expect(firstFinding().getAttribute("aria-current")).toBeNull();
    expect((await drawnNode("table")).classList.contains("selected")).toBe(
      false,
    );
    expect(document.activeElement).toBe(firstFinding());
  });

  // Fails if a click on the empty canvas leaves the finding selected, or
  // selecting a component doesn't replace it.
  it("clears on a click on the empty canvas, and gives way to another selection", async () => {
    await renderRun();
    fireEvent.click(firstFinding());
    fireEvent.click(document.querySelector(".react-flow__pane") as Element);
    expect(firstFinding().getAttribute("aria-current")).toBeNull();

    fireEvent.click(firstFinding());
    fireEvent.click(await drawnNode("fn"));

    expect(selectedTab()).toBe("Details");
    fireEvent.click(screen.getByRole("tab", { name: "Run" }));
    expect(firstFinding().getAttribute("aria-current")).toBeNull();
  });

  // Fails if the message isn't in a live region that was already on the
  // page, names the component from the project (which no longer has it),
  // or the finding marks something on the diagram anyway.
  it("says so when the finding's component has gone since the run", async () => {
    const { change } = await renderRun();
    change(withoutTable());
    const regions = within(runTab()).getAllByRole("status");
    expect(regions.every((region) => region.textContent === "")).toBe(true);

    fireEvent.click(firstFinding());

    const said = regions.map((region) => region.textContent);
    expect(said).toContain("Table isn't in the project any more.");
    expect(document.querySelector(".react-flow__node.selected")).toBeNull();
  });
});
