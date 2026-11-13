// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  clickRun,
  detailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** Two workloads: "Steady", which runs, and "Lunch rush", which doesn't. */
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "lunch", name: "Lunch rush", mix: [] }],
};

function selectSteady(): void {
  const button = revealButton("Steady");
  button.focus();
  fireEvent.click(button);
}

function nameField(): HTMLInputElement {
  const details = screen.getByRole("region", { name: "Workload dock" });
  return within(details).getByRole("textbox", { name: "Name" });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Workload" });
}

/** Types into the name field, which has the focus. */
function type(text: string): HTMLInputElement {
  const input = nameField();
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/** Whether the first workload of the record has the name. */
function firstIsNamed(name: string): (record: { project: Project }) => boolean {
  return (record) => record.project.workloads[0]?.name === name;
}

/** The message the field's `aria-describedby` points at. */
function messageOf(input: HTMLInputElement): string | undefined {
  const id = input.getAttribute("aria-describedby") ?? "";
  return document.getElementById(id)?.textContent ?? undefined;
}

describe("OpenedProject's workload name", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Enter doesn't save the name once, or the undo step isn't named
  // "Rename … to …", or the picker and heading keep the old name, or
  // Undo doesn't put the name back.
  it("saves a rename on Enter as one undo step, and the bar follows", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    selectSteady();

    const input = type("Dinner");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await savedRecord(projects, firstIsNamed("Dinner"));
    expect(undoButton().textContent).toBe("Undo rename Steady to Dinner");
    expect(detailsHeading().textContent).toBe("Dinner · Workload");
    expect(picker().selectedOptions[0]?.textContent).toBe("Dinner");
    fireEvent.click(undoButton());
    expect(undoneRegion().textContent).toBe("Undid: rename Steady to Dinner.");
    expect(nameField().value).toBe("Steady");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if leaving the field doesn't save its draft.
  it("saves a rename on leaving the field", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    selectSteady();

    fireEvent.blur(type("Dinner"));

    await savedRecord(projects, firstIsNamed("Dinner"));
    expect(detailsHeading().textContent).toBe("Dinner · Workload");
  });

  // Fails if Escape leaves the draft in the field, or saves it.
  it("puts back the saved name on Escape, and saves nothing", () => {
    renderProject({ project: twoWorkloads });
    selectSteady();

    fireEvent.keyDown(type("Dinner"), { key: "Escape" });

    expect(nameField().value).toBe("Steady");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if another workload's name, in any case, saves or leaves the
  // field, or its message isn't tied to the field.
  it("keeps a taken name in the field with its message, and saves nothing", () => {
    renderProject({ project: twoWorkloads });
    selectSteady();

    const input = type("lunch RUSH");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("lunch RUSH");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(input)).toBe(
      "Another workload already uses this name. Please choose another name.",
    );
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if an empty name saves, or its message isn't tied to the field.
  it("keeps an empty name in the field with its message", () => {
    renderProject({ project: twoWorkloads });
    selectSteady();

    const input = type("  ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(input)).toBe("A workload needs a name.");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if the name in another case, which isn't a clash with itself,
  // is refused.
  it("accepts the workload's own name in another case", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    selectSteady();

    fireEvent.keyDown(type("STEADY"), { key: "Enter" });

    await savedRecord(projects, firstIsNamed("STEADY"));
  });

  // Fails if a rename of the workload that ran leaves the run current:
  // ADR-0018 compares the whole workload the run used.
  it("marks the run of it out of date", async () => {
    const { runner } = renderProject({ project: twoWorkloads });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    expect(statusRegions()[1].textContent).toBe("");
    selectSteady();

    fireEvent.keyDown(type("Dinner"), { key: "Enter" });

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });

  // Fails if renaming a workload the run didn't use marks the run out of
  // date.
  it("keeps the run of another workload current", async () => {
    const { runner } = renderProject({ project: twoWorkloads });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    const row = revealButton(/^Lunch rush/);
    row.focus();
    fireEvent.click(row);

    fireEvent.keyDown(type("Dinner"), { key: "Enter" });

    expect(detailsHeading().textContent).toBe("Dinner · Workload");
    expect(statusRegions()[1].textContent).toBe("");
  });
});
