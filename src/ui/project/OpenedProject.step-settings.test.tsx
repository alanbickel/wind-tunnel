// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { InMemoryProjectRepository } from "../../application/testing/in-memory-project-repository";
import { itemStoreUseCases } from "../../application/testing/item-store-types";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project, Step, StepSettings } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { pressUndo, revealButton } from "./testing/canvas-panels";
import {
  outlineStatus,
  renderOpenedProject,
  savedRecord,
} from "./testing/render-opened-project";

// A step's request settings in its Details (ADR-0024), over the test types:
// "W" is front · invoke, which calls store · read. A read takes "Item size"
// (default 4 KB) and "Read time per KB" (default 1 ms); a write takes none.
// No AWS type takes request settings yet.

/** The store's read, setting these, or none. */
function storeRead(settings?: StepSettings): Step {
  return {
    id: "store-read",
    componentId: "store",
    action: "read",
    ...(settings && { settings }),
  };
}

/**
 * The item store's project, as the sample's id so `savedRecord` finds it:
 * front → store, with the workflow "W", whose call is `call`.
 */
function project(call: Step): Project {
  const store = { id: "store", type: "test-item-store", name: "store" };
  const front = { id: "front", type: "test-worker-pool", name: "front" };
  const serviceTime = { kind: "constant", valueMs: 1 };
  const edge = { ...sampleRecord.project.architecture.edges[0] };
  return {
    ...sampleRecord.project,
    architecture: {
      components: [
        { ...front, config: { workers: 4, serviceTime } },
        { ...store, config: { writeMs: 2 } },
      ],
      edges: [
        {
          ...edge,
          id: "front-store",
          from: "front",
          to: "store",
        } as Project["architecture"]["edges"][number],
      ],
    },
    workflows: [
      {
        id: "w",
        name: "W",
        root: {
          id: "front-invoke",
          componentId: "front",
          action: "invoke",
          calls: [call],
        },
      },
    ],
    workloads: [],
  };
}

/** Opens the project with the store's read setting these, and selects it. */
function openAndSelect(settings?: StepSettings) {
  const projects = new InMemoryProjectRepository();
  const view = renderOpenedProject({
    project: project(storeRead(settings)),
    projects,
    useCases: itemStoreUseCases(projects),
  });
  const row = revealButton(/^W\b/);
  row.focus();
  fireEvent.click(row);
  const outline = screen.getByRole("list", { name: "Steps" });
  fireEvent.click(
    within(outline).getByRole("button", { name: /^1\.1 store · read/ }),
  );
  return view;
}

/** The selected step's request settings, in the inspector's Details. */
function settingsRegion(): HTMLElement {
  const details = screen.getByRole("region", { name: "Details" });
  return within(details).getByRole("region", { name: "Request settings" });
}

function field(label: string): HTMLInputElement {
  return within(settingsRegion()).getByRole<HTMLInputElement>("textbox", {
    name: label,
  });
}

function typeAndLeave(input: HTMLInputElement, value: string): void {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

/** Details' polite region, which says what a setting's save did. */
function detailsStatus(): HTMLElement {
  const details = screen.getByRole("region", { name: "Details" });
  return within(details).getByRole("status");
}

/** The store step's settings, as the record has them. */
function storeSettings(record: ProjectRecord): StepSettings | undefined {
  return record.project.workflows[0]?.root.calls?.[0]?.settings;
}

/** How many settings say they use the default. */
function marks(): number {
  return within(settingsRegion()).queryAllByText("Uses the default").length;
}

describe("OpenedProject's editing a step's request settings", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(cleanup);

  // Fails if a step's Details doesn't show its action's settings through
  // the setting fields, at their defaults, each marked as the default.
  it("shows each setting, at its default and marked so, for a step that sets none", () => {
    openAndSelect();

    expect(field("Item size").value).toBe("4");
    expect(field("Read time per KB").value).toBe("1");
    expect(marks()).toBe(2);
  });

  // Fails if a saved value isn't stored on the step, isn't one undo step
  // named for the step and the setting, isn't announced, or Undo doesn't
  // put the default back.
  it("saves a value on the step as one undo step, announces it, and undoes it", async () => {
    const { projects } = openAndSelect();

    typeAndLeave(field("Item size"), "40");

    const saved = await savedRecord(
      projects,
      (r) => storeSettings(r) !== undefined,
    );
    expect(storeSettings(saved)).toEqual({ itemSizeKb: 40 });
    expect(detailsStatus().textContent).toBe(
      "Set store · read's item size to 40 KB.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo change store · read's item size",
      }),
    ).toBeTruthy();
    expect(marks()).toBe(1);

    pressUndo();

    await savedRecord(projects, (r) => storeSettings(r) === undefined);
    expect(field("Item size").value).toBe("4");
    expect(marks()).toBe(2);
  });

  // Fails if Reset doesn't store the step without the value, so it follows
  // the default again, or isn't named "Reset" for Undo.
  it("resets a value to the default, which the step then follows", async () => {
    const { projects } = openAndSelect({ itemSizeKb: 40, msPerKb: 2 });

    fireEvent.click(
      within(settingsRegion()).getByRole("button", {
        name: "Reset to default: Item size",
      }),
    );

    const saved = await savedRecord(
      projects,
      (r) => storeSettings(r)?.itemSizeKb === undefined,
    );
    expect(storeSettings(saved)).toEqual({ msPerKb: 2 });
    expect(detailsStatus().textContent).toBe(
      "Set store · read's item size to the default, 4 KB.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo reset store · read's item size",
      }),
    ).toBeTruthy();
  });

  // Fails if changing a step's action keeps its settings on screen or in
  // the record, or the announcement doesn't say they're gone.
  it("drops the settings when the step's action changes, and says so", async () => {
    const { projects } = openAndSelect({ itemSizeKb: 40 });

    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), {
      target: { value: "write" },
    });

    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.[0]?.action === "write",
    );
    expect(storeSettings(saved)).toBeUndefined();
    expect(outlineStatus().textContent).toBe(
      "Changed store · read to store · write. Its request settings are gone.",
    );
    expect(
      screen.queryByRole("region", { name: "Request settings" }),
    ).toBeNull();
  });
});
