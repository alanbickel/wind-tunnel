// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { MixEntry, Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import { renderOpenedProject as renderProject } from "./testing/render-opened-project";

const [read] = sampleRecord.project.workflows;
const [steady] = sampleRecord.project.workloads;
if (read === undefined || steady === undefined) {
  throw new Error("The sample has a workflow and a workload");
}

/** The sample with a second workflow, "Steady" with this mix, 45 s of 10 to 25 requests/s. */
function projectWith(mix: MixEntry[]): Project {
  const list = {
    id: "list",
    name: "List items",
    root: { id: "list-root", componentId: "table", action: "read" },
  } as const;
  return {
    ...sampleRecord.project,
    workflows: [read as NonNullable<typeof read>, list],
    workloads: [
      {
        ...(steady as NonNullable<typeof steady>),
        durationMs: 45_000,
        profile: [
          { atMs: 0, requestsPerSec: 10 },
          { atMs: 60_000, requestsPerSec: 30 },
        ],
        mix,
      },
    ],
  };
}

function dock(): HTMLElement {
  screen.getByRole("region", { name: "Dock" });
  return screen.getByRole("region", { name: "Dock" });
}

function selectSteady(): void {
  const button = revealButton(/^Steady/);
  button.focus();
  fireEvent.click(button);
}

beforeEach(() => {
  stubDiagramBrowserApis();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the mix bar and What this sends", () => {
  // Fails if the bar is missing, has no text alternative naming each share,
  // or a segment's size isn't its share.
  it("draws the split as a bar with a text alternative", () => {
    renderProject({
      project: projectWith([
        { workflowId: "read", weight: 80 },
        { workflowId: "list", weight: 20 },
      ]),
    });
    selectSteady();

    const bar = within(dock()).getByRole("img", { name: /^Mix split:/ });

    expect(bar.getAttribute("aria-label")).toBe(
      "Mix split: Read item 80.0%, List items 20.0%",
    );
    expect(
      [...bar.children].map((s) => (s as HTMLElement).style.flexGrow),
    ).toEqual(["800", "200"]);
  });

  // Fails if the summary's figures aren't the profile's area, split by the
  // mix so they add up: 788 requests is 630 and 158.
  it("says what the workload sends, adding up", () => {
    renderProject({
      project: projectWith([
        { workflowId: "read", weight: 80 },
        { workflowId: "list", weight: 20 },
      ]),
    });
    selectSteady();

    const summary = within(dock()).getByRole("region", {
      name: "What this sends",
    });

    expect(summary.textContent).toContain(
      "About 788 requests before the run ends",
    );
    expect(summary.textContent).toContain("Peak rate 25 requests/s");
    expect(
      within(summary)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Read item: About 630 requests",
      "List items: About 158 requests",
    ]);
  });

  // Fails if an empty mix draws a bar or lists workflows, instead of showing
  // its problem alone.
  it("has no bar and no workflow lines for an empty mix", () => {
    renderProject({ project: projectWith([]) });
    selectSteady();

    expect(
      within(dock()).queryByRole("img", { name: /^Mix split/ }),
    ).toBeNull();
    expect(
      within(dock())
        .queryByRole("region", { name: "What this sends" })
        ?.querySelectorAll("li").length,
    ).toBe(0);
    expect(dock().textContent).toContain("No workflows in the mix.");
  });
});
