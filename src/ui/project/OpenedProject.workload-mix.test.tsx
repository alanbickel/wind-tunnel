// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type {
  MixEntry,
  Project,
  Workflow,
  Workload,
} from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { revealButton } from "./testing/canvas-panels";
import {
  cantRunRegion,
  clickRun,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

const [read] = sampleRecord.project.workflows;
const [sampleWorkload] = sampleRecord.project.workloads;
if (read === undefined || sampleWorkload === undefined) {
  throw new Error("The sample has a workflow and a workload");
}
const steady: Workload = sampleWorkload;

/** Three workflows, "Read item", "List items", and "Write item". */
const workflows: Workflow[] = [
  read,
  {
    id: "list",
    name: "List items",
    root: { id: "list-root", componentId: "table", action: "read" },
  },
  {
    id: "write",
    name: "Write item",
    root: { id: "write-root", componentId: "table", action: "write" },
  },
];

/** The sample with three workflows, "Steady" with this mix, and "Lunch rush", empty. */
function projectWith(mix: MixEntry[]): Project {
  return {
    ...sampleRecord.project,
    workflows,
    workloads: [
      { ...steady, mix },
      { ...steady, id: "lunch", name: "Lunch rush", mix: [] },
    ],
  };
}

const eighty20: MixEntry[] = [
  { workflowId: "read", weight: 80 },
  { workflowId: "list", weight: 20 },
];

/** Selects the workload or workflow whose name starts with `name`. */
function select(name: string): void {
  const button = revealButton(new RegExp(`^${name}`));
  button.focus();
  fireEvent.click(button);
}

function details(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Details" });
}

function weights(): HTMLInputElement[] {
  return within(details()).queryAllByRole("textbox", { name: "Weight" });
}

function picker(): HTMLSelectElement {
  return within(details()).getByRole("combobox", { name: "Add to mix" });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

/** What the picker offers: its choices, without the prompt. */
function offered(): string[] {
  return [...picker().options].filter((o) => !o.disabled).map((o) => o.text);
}

/** The share column of the mix's rows, as shown. */
function shares(): string[] {
  const [table] = within(details()).getAllByRole("table");
  const rows = within(table as HTMLElement)
    .getAllByRole("row")
    .slice(1);
  return rows.map(
    (row) => (row as HTMLTableRowElement).cells[2]?.textContent ?? "",
  );
}

/** The shares' sum, in tenths of a percent. */
function sharesTenths(): number {
  const tenths = shares().map((text) =>
    Math.round(Number.parseFloat(text) * 10),
  );
  return tenths.reduce((sum, t) => sum + t, 0);
}

/** The text of a row's remove button's row: its workflow's name and issues. */
function rowFor(name: string): HTMLElement {
  return within(details())
    .getByRole("rowheader", { name: new RegExp(`^${name}`) })
    .closest("tr") as HTMLElement;
}

function removeFromMix(name: string): void {
  fireEvent.click(
    within(details()).getByRole("button", { name: `Remove ${name} from mix` }),
  );
}

function setWeight(input: HTMLInputElement, text: string): void {
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function messageOf(input: HTMLInputElement): string | undefined {
  const [first] = (input.getAttribute("aria-describedby") ?? "").split(" ");
  return document.getElementById(first ?? "")?.textContent ?? undefined;
}

describe("OpenedProject's editing a workload's mix", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the picker offers a workflow already in the mix, skips one that
  // isn't, or lists them out of project order.
  it("offers only the workflows not in the mix, in project order", () => {
    renderProject({
      project: projectWith([{ workflowId: "list", weight: 1 }]),
    });
    select("Steady");

    expect(offered()).toEqual(["Read item", "Write item"]);
  });

  // Fails if either empty state of the picker says other words, or the
  // picker stays usable.
  it("says why the picker can't offer anything", () => {
    renderProject({ project: { ...projectWith([]), workflows: [] } });
    select("Steady");
    expect(picker().getAttribute("aria-disabled")).toBe("true");
    expect(details().textContent).toContain("Add a workflow first.");
    cleanup();

    renderProject({
      project: projectWith(
        ["read", "list", "write"].map((workflowId) => ({
          workflowId,
          weight: 1,
        })),
      ),
    });
    select("Steady");
    expect(picker().getAttribute("aria-disabled")).toBe("true");
    expect(details().textContent).toContain(
      "Every workflow is already in the mix.",
    );
  });

  // Fails if adding doesn't append at weight 1, as one step named for it,
  // move the focus to the new weight field, or Undo doesn't take it out.
  it("adds an entry at weight 1, focuses its weight, and undoes", async () => {
    const { projects } = renderProject({ project: projectWith(eighty20) });
    select("Steady");

    fireEvent.change(picker(), { target: { value: "write" } });

    const saved = await savedRecord(
      projects,
      (r) => (r.project.workloads[0]?.mix.length ?? 0) === 3,
    );
    expect(saved.project.workloads[0]?.mix[2]).toEqual({
      workflowId: "write",
      weight: 1,
    });
    expect(weights()).toHaveLength(3);
    expect(document.activeElement).toBe(weights()[2]);
    expect(undoButton().textContent).toBe(
      "Undo add Write item to Steady's mix",
    );
    fireEvent.click(undoButton());
    expect(weights()).toHaveLength(2);
  });

  // Fails if a weight doesn't save on Enter as a step named for it, or the
  // shares don't change with it and still add to 100.0%.
  it("saves a weight on Enter, and the shares follow", async () => {
    const { projects } = renderProject({ project: projectWith(eighty20) });
    select("Steady");
    expect(shares()).toEqual(["80.0%", "20.0%"]);

    setWeight(weights()[1] as HTMLInputElement, "1");

    await savedRecord(
      projects,
      (r) => r.project.workloads[0]?.mix[1]?.weight === 1,
    );
    expect(undoButton().textContent).toBe(
      "Undo change List items's weight in Steady to 1",
    );
    expect(shares()).toEqual(["98.8%", "1.2%"]);
    expect(sharesTenths()).toBe(1000);
    expect(details().textContent).toContain("Shares total 100%");
  });

  // Fails if three equal weights stop reading 33.4, 33.3, 33.3, or any edit
  // (add, re-weight, remove) leaves the shown shares not adding to 100.0%.
  it("keeps the shown shares at exactly 100.0% after each edit", () => {
    renderProject({
      project: projectWith([{ workflowId: "read", weight: 1 }]),
    });
    select("Steady");

    fireEvent.change(picker(), { target: { value: "list" } });
    fireEvent.change(picker(), { target: { value: "write" } });
    expect(shares()).toEqual(["33.4%", "33.3%", "33.3%"]);
    expect(sharesTenths()).toBe(1000);
    setWeight(weights()[0] as HTMLInputElement, "7");
    expect(sharesTenths()).toBe(1000);
    removeFromMix("List items");
    expect(sharesTenths()).toBe(1000);
  });

  // Fails if a weight's help is missing or isn't tied to the field.
  it("describes the weight with its help", () => {
    renderProject({ project: projectWith(eighty20) });
    select("Steady");

    const ids = (weights()[0]?.getAttribute("aria-describedby") ?? "").split(
      " ",
    );
    const text = ids.map((id) => document.getElementById(id)?.textContent);
    expect(text).toContain("Read item");
    expect(text).toContain(
      "How often this workflow runs compared with the others in the mix. Weights are relative: 80 and 20 mean four requests in five are this workflow's.",
    );
  });

  // Fails if 0 or -5 saves, or the refusal's message isn't tied to the field.
  it.each(["0", "-5"])("refuses a weight of %s with its message", (text) => {
    renderProject({ project: projectWith(eighty20) });
    select("Steady");

    const input = weights()[0] as HTMLInputElement;
    setWeight(input, text);

    expect(input.value).toBe(text);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(input)).toBe("Weight must be more than 0.");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if Escape leaves the draft, or leaving the field with a fraction
  // refuses it: a weight needn't be a whole number.
  it("puts back the saved weight on Escape, and accepts a fraction on leaving", async () => {
    const { projects } = renderProject({ project: projectWith(eighty20) });
    select("Steady");
    const input = weights()[0] as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("80");
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.blur(input);

    await savedRecord(
      projects,
      (r) => r.project.workloads[0]?.mix[0]?.weight === 2.5,
    );
  });

  // Fails if removing asks first, the focus doesn't go to the next row's
  // weight, or to "Add to mix" after the last row.
  it("removes without asking, and moves the focus on", () => {
    renderProject({ project: projectWith(eighty20) });
    select("Steady");

    removeFromMix("Read item");
    expect(document.activeElement).toBe(weights()[0]);
    expect(rowFor("List items")).toBeTruthy();
    removeFromMix("List items");

    expect(document.activeElement).toBe(picker());
  });

  // Fails if removing the last entry doesn't leave the empty-mix words and
  // the bar's reason, adding one back doesn't clear both, or Undo doesn't
  // bring the entry back at its weight and place.
  it("says why an empty mix can't run, and clears it when an entry returns", () => {
    renderProject({ project: projectWith(eighty20) });
    select("Steady");

    removeFromMix("Read item");
    removeFromMix("List items");
    expect(details().textContent).toContain(
      "No workflows in the mix. A workload with an empty mix can't run.",
    );
    expect(details().textContent).not.toContain("Shares total");
    expect(cantRunRegion().textContent).toBe(
      "Steady can't run yet: The mix has no workflows.",
    );
    fireEvent.change(picker(), { target: { value: "read" } });
    expect(cantRunRegion().textContent).toBe("");
    expect(details().textContent).not.toContain("No workflows in the mix");
    fireEvent.click(undoButton());
    fireEvent.click(undoButton());
    fireEvent.click(undoButton());

    expect(weights().map((w) => w.value)).toEqual(["80", "20"]);
  });

  // Fails if a stored weight of 0, or an entry whose workflow is gone, shows
  // no issue on its row, or can't be fixed from the screen.
  it("shows a stored 0 weight and a missing workflow on their rows, and fixes both", () => {
    renderProject({
      project: projectWith([
        { workflowId: "read", weight: 0 },
        { workflowId: "ghost", weight: 1 },
      ]),
    });
    select("Steady");
    expect(rowFor("Read item").textContent).toMatch(/weights must be positive/);
    expect(rowFor("A workflow that is no longer").textContent).toMatch(
      /isn't in the project/,
    );

    setWeight(weights()[0] as HTMLInputElement, "3");
    removeFromMix("A workflow that is no longer in the project.");

    expect(rowFor("Read item").textContent).not.toMatch(/positive/);
    expect(weights()).toHaveLength(1);
    expect(cantRunRegion().textContent).toBe("");
  });

  // Fails if removing a workflow in the workflow editor leaves its entry in
  // the mix or the shares unsummed, or Undo doesn't bring the entry back at
  // its weight and place.
  it("shows a removed workflow leave the mix, and return on Undo", () => {
    renderProject({ project: projectWith(eighty20) });
    select("List items");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Remove List items?" }),
      ).getByRole("button", { name: "Remove" }),
    );
    select("Steady");

    expect(weights().map((w) => w.value)).toEqual(["80"]);
    expect(shares()).toEqual(["100.0%"]);
    fireEvent.click(undoButton());
    select("Steady");
    expect(weights().map((w) => w.value)).toEqual(["80", "20"]);
    expect(shares()).toEqual(["80.0%", "20.0%"]);
  });

  // Fails if editing the mix of a workload that didn't run marks the run out
  // of date, or editing the one that ran leaves it current.
  it("marks the run out of date only when the workload that ran is edited", async () => {
    const { runner } = renderProject({ project: projectWith(eighty20) });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    select("Lunch rush");

    fireEvent.change(picker(), { target: { value: "read" } });
    expect(statusRegions()[1].textContent).toBe("");
    select("Steady");
    removeFromMix("List items");

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });
});
