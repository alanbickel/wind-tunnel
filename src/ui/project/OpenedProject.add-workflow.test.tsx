// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  clickRun,
  detailsHeading,
  queryDetailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

import { revealButton } from "./testing/canvas-panels";

/** A blank project: no components, so no workflow can start. */
const blank: Project = {
  ...sampleRecord.project,
  architecture: { components: [], edges: [] },
  workflows: [],
  workloads: [],
};

/** The sample's project with no workflows, as a project with components only. */
const noWorkflows: Project = { ...sampleRecord.project, workflows: [] };

function addWorkflowButton(): HTMLElement {
  return revealButton("Add workflow");
}

function detailsPanel(): HTMLElement {
  return screen.getByRole("region", { name: "Details" });
}

function nameField(): HTMLInputElement {
  return within(detailsPanel()).getByRole("textbox", { name: "Name" });
}

function picker(label: string): HTMLSelectElement {
  return within(detailsPanel()).getByRole("combobox", { name: label });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

/** Chooses an option of a picker, by its value. */
function choose(label: string, value: string): void {
  fireEvent.change(picker(label), { target: { value } });
}

/** Names the draft's workflow, leaving the field as a keyboard or a click would. */
function nameDraft(text: string): void {
  const input = nameField();
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

/** The workflows' names in the saved record, once a save with `count` lands. */
async function savedNames(
  projects: ReturnType<typeof renderProject>["projects"],
  count: number,
): Promise<string[]> {
  const record = await savedRecord(
    projects,
    (r) => r.project.workflows.length === count,
  );
  return record.project.workflows.map((w) => w.name);
}

/**
 * The name input's `onBlur` as it is now. A browser fires `blur` as it
 * removes the focused input, and runs that handler; jsdom and React don't,
 * so a test keeps the handler and calls it after the input has gone.
 */
function blurHandlerOf(input: HTMLElement): () => void {
  const key = Object.keys(input).find((name) =>
    name.startsWith("__reactProps"),
  );
  const props: unknown =
    key === undefined ? undefined : Reflect.get(input, key);
  const onBlur: unknown =
    typeof props === "object" && props !== null
      ? Reflect.get(props, "onBlur")
      : undefined;
  if (typeof onBlur !== "function") throw new Error("The input has no onBlur");
  return () => {
    act(() => {
      Reflect.apply(onBlur, undefined, []);
    });
  };
}

describe("OpenedProject's Add workflow", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if "Add workflow" doesn't open a draft with the first free name
  // selected and focused, an empty first step, and a picker listing every
  // component.
  it("opens a draft with a free name, selected, and a picker of every component", () => {
    renderProject({ project: noWorkflows });

    fireEvent.click(addWorkflowButton());

    expect(detailsHeading().textContent).toBe("New workflow");
    const input = nameField();
    expect(input.value).toBe("workflow-1");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 10]);
    const options = within(picker("Component")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Choose a component",
      "API (API Gateway)",
      "Function (Lambda)",
      "Table (DynamoDB)",
    ]);
    expect(picker("Component").value).toBe("");
    expect(screen.queryByRole("combobox", { name: "Action" })).toBeNull();
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a name, a component, and its only action don't save one
  // workflow, selected, as one undo step named "Add workflow …", or undo
  // doesn't take it away and clear the selection.
  it("saves once the first step is complete, selects it, and undoes as one step", async () => {
    const { projects } = renderProject({ project: noWorkflows });
    fireEvent.click(addWorkflowButton());
    nameDraft("Get order");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");

    choose("Component", "api");

    expect(await savedNames(projects, 1)).toEqual(["Get order"]);
    expect(detailsHeading().textContent).toBe("Get order · Workflow");
    // Both the list's row and the picker's button name it.
    expect(
      within(screen.getByRole("list", { name: "Workflows" }))
        .getByRole("button", { name: "Get order" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(undoButton().textContent).toContain("Undo add workflow Get order");
    fireEvent.click(undoButton());
    expect(screen.queryByRole("button", { name: "Get order" })).toBeNull();
    expect(queryDetailsHeading()).toBeNull();
  });

  // Fails if a component with several actions saves before one is chosen,
  // or its action picker lists anything but what its type accepts.
  it("saves nothing until an action is chosen for a component with several", async () => {
    const { projects } = renderProject({ project: noWorkflows });
    fireEvent.click(addWorkflowButton());

    choose("Component", "table");

    const actions = within(picker("Action")).getAllByRole("option");
    expect(actions.map((o) => o.textContent)).toEqual([
      "Choose an action",
      "read",
      "write",
    ]);
    expect(picker("Action").value).toBe("");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
    choose("Action", "write");
    const record = await savedRecord(
      projects,
      (r) => r.project.workflows.length === 1,
    );
    expect(record.project.workflows[0]?.root).toMatchObject({
      componentId: "table",
      action: "write",
    });
  });

  // Fails if a name another workflow uses, in any case, saves with a
  // complete step, or the draft's name field doesn't say why.
  it("refuses a taken name and saves it once it's changed", async () => {
    const { projects } = renderProject();
    fireEvent.click(addWorkflowButton());
    nameDraft("read ITEM");
    choose("Component", "api");

    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
    nameDraft("Write item");
    expect(await savedNames(projects, 2)).toEqual(["Read item", "Write item"]);
  });

  // Fails if Escape on a draft saves it or adds an undo step, or if the
  // blur a browser fires as the name field is removed saves what Escape
  // dropped (the test runs the field's handler after it has gone).
  it("saves nothing on Escape, then on the blur that follows", () => {
    renderProject({ project: noWorkflows });
    fireEvent.click(addWorkflowButton());
    // A blank name, so the complete step below stays unsaved.
    const input = nameField();
    fireEvent.change(input, { target: { value: " " } });
    choose("Component", "table");
    choose("Action", "read");
    // The first Escape puts the name back, which passes its check: the
    // draft is now complete, but nothing has committed it.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(nameField().value).toBe("workflow-1");
    const blur = blurHandlerOf(input);

    fireEvent.keyDown(input, { key: "Escape" });
    blur();

    expect(queryDetailsHeading()).toBeNull();
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "workflow-1" })).toBeNull();
  });

  // Fails if selecting something else while a draft is open keeps the
  // draft, or saves it. The name is taken and the component has one
  // action, so only the name check holds the draft back.
  it("drops the draft when a component is selected", () => {
    renderProject();
    fireEvent.click(addWorkflowButton());
    nameDraft("Read item");
    choose("Component", "api");

    fireEvent.click(revealButton(/^API \(/));

    expect(detailsHeading().textContent).toContain("API");
    expect(screen.queryByRole("button", { name: "workflow-1" })).toBeNull();
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a component an Undo took away is still offered, or stays
  // chosen, so that choosing its action saves a step that calls nothing.
  it("drops a component from the draft when an Undo removes it", () => {
    renderProject({ project: noWorkflows });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    const types = screen.getByRole("list", { name: "Component types" });
    fireEvent.click(within(types).getByRole("button", { name: /^DynamoDB:/ }));
    fireEvent.click(addWorkflowButton());
    const added = within(picker("Component"))
      .getAllByRole("option")
      .find(
        (o) =>
          o.textContent.endsWith("(DynamoDB)") &&
          o.textContent !== "Table (DynamoDB)",
      );
    if (!(added instanceof HTMLOptionElement)) throw new Error("No new option");
    choose("Component", added.value);

    fireEvent.click(undoButton());

    const options = within(picker("Component")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).not.toContain(added.textContent);
    expect(picker("Component").value).toBe("");
    expect(screen.queryByRole("combobox", { name: "Action" })).toBeNull();
  });

  // Fails if "Add workflow" in a project with no components is usable, or
  // doesn't say why.
  it("is unusable, and says why, with no components", () => {
    renderProject({ project: blank });
    const button = addWorkflowButton();

    fireEvent.click(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    const why = document.getElementById(
      button.getAttribute("aria-describedby") ?? "",
    );
    expect(why?.textContent).toBe("Add a component first.");
    expect(queryDetailsHeading()).toBeNull();
  });

  // Fails if an add leaves the run on screen current: a new workflow is
  // part of the project ADR-0018 compares.
  it("marks the run out of date", async () => {
    const { runner } = renderProject();
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    expect(statusRegions()[1].textContent).toBe("");
    fireEvent.click(addWorkflowButton());

    choose("Component", "api");

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });
});
