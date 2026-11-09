// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../domain/model/project";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  clickRun,
  detailsHeading,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

/** The sample project with a second workflow, "Write item". */
const twoWorkflows: Project = {
  ...sampleRecord.project,
  workflows: [
    ...sampleRecord.project.workflows,
    {
      id: "write",
      name: "Write item",
      root: { id: "write-api", componentId: "api", action: "invoke" },
    },
  ],
};

/** Selects "Read item" from the Workflows list. */
function selectRead(): void {
  const button = screen.getByRole("button", { name: "Read item" });
  button.focus();
  fireEvent.click(button);
}

function nameField(): HTMLInputElement {
  const details = screen.getByRole("tabpanel", { name: "Details" });
  return within(details).getByRole("textbox", { name: "Name" });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

/** Types into the name field, which has the focus. */
function type(text: string): HTMLInputElement {
  const input = nameField();
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/** Whether the first workflow of the record has the name. */
function firstIsNamed(name: string): (record: { project: Project }) => boolean {
  return (record) => record.project.workflows[0]?.name === name;
}

describe("OpenedProject's workflow name", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if Enter doesn't save the name, or the undo step isn't named
  // "Rename … to …", or undoing it doesn't put the name back.
  it("saves a rename on Enter, as an undo step", async () => {
    const { projects } = renderProject({ project: twoWorkflows });
    selectRead();

    fireEvent.keyDown(type("Fetch item"), { key: "Enter" });

    await savedRecord(projects, firstIsNamed("Fetch item"));
    expect(undoButton().textContent).toContain(
      "Undo rename Read item to Fetch item",
    );
    fireEvent.click(undoButton());
    expect(undoneRegion().textContent).toBe(
      "Undid: rename Read item to Fetch item.",
    );
    expect(nameField().value).toBe("Read item");
  });

  // Fails if the name with spaces around it, which renames nothing, stays
  // in the field as typed, or saves.
  it("shows the saved name again when only spaces were added", () => {
    renderProject({ project: twoWorkflows });
    selectRead();

    const input = type("Read item  ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("Read item");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if leaving the field doesn't save its draft.
  it("saves a rename on leaving the field", async () => {
    const { projects } = renderProject({ project: twoWorkflows });
    selectRead();

    fireEvent.blur(type("Fetch item"));

    await savedRecord(projects, firstIsNamed("Fetch item"));
    expect(detailsHeading().textContent).toBe("Fetch item · Workflow");
  });

  // Fails if Escape leaves the draft in the field, or saves it.
  it("puts back the saved name on Escape, and saves nothing", () => {
    renderProject({ project: twoWorkflows });
    selectRead();

    fireEvent.keyDown(type("Fetch item"), { key: "Escape" });

    expect(nameField().value).toBe("Read item");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a name another workflow uses, in any case, saves or leaves
  // the field, or its message isn't tied to the field.
  it("keeps a taken name in the field with its message, and saves nothing", () => {
    renderProject({ project: twoWorkflows });
    selectRead();

    const input = type("write ITEM");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("write ITEM");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(
      input.getAttribute("aria-describedby") ?? "",
    );
    expect(message?.textContent).toBe(
      "Another workflow already uses this name. Please choose another name.",
    );
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if an empty name saves, or its message isn't tied to the field.
  it("keeps an empty name in the field with its message", () => {
    renderProject({ project: twoWorkflows });
    selectRead();

    const input = type("  ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(input.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("A workflow needs a name.");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a workflow's rename, unlike a project's, leaves the run
  // current: workflows count in ADR-0018's comparison.
  it("marks the run out of date", async () => {
    const { runner } = renderProject({ project: twoWorkflows });
    clickRun();
    runner.send(sampleSnapshot({ second: 1 }));
    await runner.finish();
    expect(statusRegions()[1].textContent).toBe("");
    selectRead();

    fireEvent.keyDown(type("Fetch item"), { key: "Enter" });

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });
});
