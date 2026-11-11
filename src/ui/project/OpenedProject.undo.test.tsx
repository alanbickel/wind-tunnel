// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { awsSaveProject } from "../../application/testing/aws-save-project";
import { InMemoryProjectRepository } from "../../application/testing/in-memory-project-repository";
import { sampleRecord } from "../../application/testing/sample-record";
import type { UseCases } from "../app/use-cases";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  clickRun,
  queryDetailsHeading,
  renderOpenedProject,
  savedRecord,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

import { revealButton } from "./testing/canvas-panels";

/** Selects a component from the diagram's text version, as the keyboard does. */
function select(name: string): void {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
}

/** Removes the selected component, confirming it. */
function removeSelected(): void {
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  const asking = screen.getByRole("group", { name: /^Remove / });
  fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));
}

/** The Undo or Redo button, whatever it names. */
function historyButton(verb: "Undo" | "Redo"): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${verb}\\b`) });
}

/** A text field in Details, by its label. */
function field(name: string): HTMLInputElement {
  const details = screen.getByRole("tabpanel", { name: "Details" });
  return within(details).getByRole("textbox", { name });
}

/** Types into a field and leaves it, as a user tabbing on would. */
function typeAndLeave(input: HTMLInputElement, text: string): void {
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

/** Presses Ctrl and the key, with Shift if given, on what has the focus. */
function pressCtrl(key: string, shiftKey = false): void {
  const target = document.activeElement ?? document.body;
  fireEvent.keyDown(target, { key, ctrlKey: true, shiftKey });
}

function concurrencyIn(record: ProjectRecord): unknown {
  const fn = record.project.architecture.components.find((c) => c.id === "fn");
  return fn?.config["concurrency"];
}

/** Saves to memory, holding the first save until `release`, and logs each. */
function heldFirstSave() {
  const projects = new InMemoryProjectRepository();
  const real = awsSaveProject(projects);
  const saved: ProjectRecord[] = [];
  let release = () => {
    // Replaced by the promise's resolve, below.
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const execute = vi.fn<UseCases["saveProject"]["execute"]>(async (record) => {
    if (saved.length === 0) await held;
    saved.push(record);
    return real.execute(record);
  });
  const releaseFirst = () => {
    release();
  };
  return { projects, saved, release: releaseFirst, saveProject: { execute } };
}

const fnName = (record: ProjectRecord) =>
  record.project.architecture.components.find((c) => c.id === "fn")?.name;

describe("OpenedProject's undo and redo", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if undoing a remove misses the component's edges or layout
  // position, doesn't save, or doesn't select what it brought back.
  it("brings back a removed component, its edges, and its place, and selects it", async () => {
    const { projects } = renderOpenedProject();
    select("Table (dynamodb)");
    removeSelected();
    await savedRecord(
      projects,
      (r) => r.project.architecture.components.length === 2,
    );

    fireEvent.click(historyButton("Undo"));

    const saved = await savedRecord(
      projects,
      (r) => r.project.architecture.components.length === 3,
    );
    expect(saved.project.architecture).toEqual(
      sampleRecord.project.architecture,
    );
    expect(saved.layout).toEqual(sampleRecord.layout);
    expect(queryDetailsHeading()?.textContent).toBe("Table · DynamoDB");
  });

  // Fails if the buttons don't name what they'd do, can be used with
  // nothing to do, or Undo isn't announced from a region that was on the
  // page, empty, before (UX §4.4).
  it("names each change on its button, and announces an undo", () => {
    renderOpenedProject();
    const region = undoneRegion();
    expect(region.textContent).toBe("");
    expect(historyButton("Undo").textContent).toBe("Undo");
    expect(historyButton("Undo").getAttribute("aria-disabled")).toBe("true");
    expect(historyButton("Redo").getAttribute("aria-disabled")).toBe("true");
    select("Function (lambda)");

    typeAndLeave(field("Concurrency"), "50");
    expect(historyButton("Undo").textContent).toBe(
      "Undo change Function's concurrency",
    );
    expect(historyButton("Undo").getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(historyButton("Undo"));

    expect(undoneRegion()).toBe(region);
    expect(region.textContent).toBe("Undid: change Function's concurrency.");
    expect(historyButton("Undo").getAttribute("aria-disabled")).toBe("true");
    expect(historyButton("Redo").textContent).toBe(
      "Redo change Function's concurrency",
    );
    fireEvent.click(historyButton("Redo"));
    expect(region.textContent).toBe("Redid: change Function's concurrency.");
    expect(field("Concurrency").value).toBe("50");
  });

  // Fails if an undo or a redo doesn't save, saves more than once, or
  // jumps ahead of the save in flight, so an older record lands last.
  it("saves each undo and redo once, after the save in flight", async () => {
    const { saved, release, saveProject } = heldFirstSave();
    renderOpenedProject({ saveProject });
    select("Function (lambda)");
    typeAndLeave(field("Name"), "Orders");

    fireEvent.click(historyButton("Undo"));
    release();
    await waitFor(() => {
      expect(saved.map(fnName)).toEqual(["Orders", "Function"]);
    });
    fireEvent.click(historyButton("Redo"));

    await waitFor(() => {
      expect(saved.map(fnName)).toEqual(["Orders", "Function", "Orders"]);
    });
    expect(saveProject.execute).toHaveBeenCalledTimes(3);
  });

  // Fails if Ctrl+Z is ignored outside a text field, or reaches the
  // record while one has the focus, taking the field's own undo; or if
  // Ctrl+Shift+Z or Ctrl+Y don't redo.
  it("undoes with Ctrl+Z, except in a text field, and redoes with Ctrl+Y", async () => {
    const { projects } = renderOpenedProject();
    select("Function (lambda)");
    const before = field("Concurrency").value;
    typeAndLeave(field("Concurrency"), "50");
    await savedRecord(projects, (r) => concurrencyIn(r) === 50);

    field("Concurrency").focus();
    pressCtrl("z");
    expect(field("Concurrency").value).toBe("50");
    expect(undoneRegion().textContent).toBe("");

    historyButton("Undo").focus();
    pressCtrl("z");
    expect(field("Concurrency").value).toBe(before);
    pressCtrl("Z", true);
    expect(field("Concurrency").value).toBe("50");
    pressCtrl("z");
    pressCtrl("y");
    expect(field("Concurrency").value).toBe("50");
  });

  // Fails if undoing back to what ran doesn't make the run current again,
  // as undo going to the record after the edit rather than the one before
  // it would not.
  it("leaves the run current after undoing a change made since it", async () => {
    const { runner } = renderOpenedProject();
    clickRun();
    await runner.finish();
    select("Function (lambda)");

    typeAndLeave(field("Concurrency"), "50");
    expect(statusRegions()[1].textContent).toBe("Out of date");
    fireEvent.click(historyButton("Undo"));

    expect(statusRegions()[1].textContent).toBe("");
    expect(screen.queryByText(/earlier version of the project/)).toBeNull();
  });

  // Fails if an undo that leaves the selected step in the project clears
  // the selection or moves it, or the outline isn't redrawn from the
  // project the undo went to.
  it("keeps a selected step through an undo that leaves it there", () => {
    renderOpenedProject();
    select("Function (lambda)");
    typeAndLeave(field("Name"), "Orders");
    select("Read item");
    select("1.1 Orders · invoke");

    // A click focuses the button in a browser, but not in jsdom.
    historyButton("Undo").focus();
    fireEvent.click(historyButton("Undo"));

    expect(queryDetailsHeading()?.textContent).toBe("Read item · Workflow");
    const step = screen.getByRole("button", { name: "1.1 Function · invoke" });
    expect(step.getAttribute("aria-current")).toBe("true");
    expect(undoneRegion().textContent).toBe(
      "Undid: rename Function to Orders.",
    );
  });

  // Fails if undoing a component's removal while one of its steps is
  // selected moves the selection to the component, or leaves the step's
  // issue or the row's count showing once the component is back.
  it("keeps a selected step through undoing its component's removal, and its issue goes", () => {
    renderOpenedProject();
    select("Table (dynamodb)");
    removeSelected();
    select("Read item · 1 problem");
    select("1.1.1 a removed component · read");
    expect(
      screen.getByText(
        "This step calls a component that isn't in the architecture any more.",
      ),
    ).toBeTruthy();

    // A click focuses the button in a browser, but not in jsdom.
    historyButton("Undo").focus();
    fireEvent.click(historyButton("Undo"));

    expect(queryDetailsHeading()?.textContent).toBe("Read item · Workflow");
    const step = screen.getByRole("button", { name: "1.1.1 Table · read" });
    expect(step.getAttribute("aria-current")).toBe("true");
    expect(step.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText(/isn't in the architecture any more/)).toBeNull();
    expect(revealButton("Read item")).toBeTruthy();
  });

  // Fails if undoing the add of the selected component leaves it
  // selected, or moves the focus off Undo.
  it("clears the selection when undoing the add of the selected component", () => {
    renderOpenedProject();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    const list = screen.getByRole("list", { name: "Component types" });
    const sqs = within(list)
      .getAllByRole("button")
      .find((button) => button.textContent.startsWith("SQS:"));
    if (sqs === undefined) throw new Error("No SQS type");
    fireEvent.click(sqs);
    expect(queryDetailsHeading()?.textContent).toBe("sqs-1 · SQS");

    // A click focuses the button in a browser, but not in jsdom.
    historyButton("Undo").focus();
    fireEvent.click(historyButton("Undo"));

    // Details says "Nothing selected" for a selection that's gone, so the
    // Run tab, which clearing shows, is what says the selection cleared.
    expect(queryDetailsHeading()).toBeNull();
    const runTab = screen.getByRole("tab", { name: "Run" });
    expect(runTab.getAttribute("aria-selected")).toBe("true");
    expect(undoneRegion().textContent).toBe("Undid: add sqs-1.");
    expect(document.activeElement).toBe(historyButton("Undo"));
  });

  // Fails if Ctrl+Z, undoing the add of the selected component while the
  // focus is on a button in its Details, leaves the focus on the page.
  it("moves the focus to Undo when Ctrl+Z takes away the Details that had it", () => {
    renderOpenedProject();
    addSqs();
    screen.getByRole("button", { name: "Remove" }).focus();

    pressCtrl("z");

    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(historyButton("Undo"));
  });

  // Fails if Ctrl+Shift+Z, redoing the remove of the selected component
  // while the focus is on a button in its Details, leaves the focus on the
  // page, or moves it to Undo instead of Redo.
  it("moves the focus to Redo when Ctrl+Shift+Z takes away the Details that had it", () => {
    renderOpenedProject();
    select("Table (dynamodb)");
    removeSelected();
    fireEvent.click(historyButton("Undo"));
    screen.getByRole("button", { name: "Remove" }).focus();

    pressCtrl("z", true);

    expect(queryDetailsHeading()).toBeNull();
    expect(document.activeElement).toBe(historyButton("Redo"));
  });
});

/** Adds an SQS component from the palette, which selects it. */
function addSqs(): void {
  fireEvent.click(screen.getByRole("button", { name: "Add component" }));
  const list = screen.getByRole("list", { name: "Component types" });
  const sqs = within(list)
    .getAllByRole("button")
    .find((button) => button.textContent.startsWith("SQS:"));
  if (sqs === undefined) throw new Error("No SQS type");
  fireEvent.click(sqs);
}
