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
import type { InMemoryProjectRepository } from "../../application/testing/in-memory-project-repository";
import { sampleRecord } from "../../application/testing/sample-record";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  cantRunRegion,
  renderOpenedProject,
} from "./testing/render-opened-project";

/** The record saved for the sample, once a save matching `check` lands. */
async function savedRecord(
  projects: InMemoryProjectRepository,
  check: (record: ProjectRecord) => boolean,
): Promise<ProjectRecord> {
  let saved: ProjectRecord | undefined;
  await waitFor(async () => {
    const lookup = await projects.get(sampleRecord.project.id);
    if (lookup.status !== "found" || !check(lookup.record)) {
      throw new Error("not saved yet");
    }
    saved = lookup.record;
  });
  if (saved === undefined) throw new Error("not saved");
  return saved;
}

function componentIds(record: ProjectRecord): string[] {
  return record.project.architecture.components.map((c) => c.id);
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: "Add component" });
}

/** Opens "Add component" and chooses the type whose line starts `name`. */
function add(name: string): void {
  fireEvent.click(addButton());
  const list = screen.getByRole("list", { name: "Component types" });
  const choice = within(list)
    .getAllByRole("button")
    .find((button) => button.textContent.startsWith(`${name}:`));
  if (choice === undefined) throw new Error(`No type ${name}`);
  fireEvent.click(choice);
}

/** Selects a component from the diagram's text version. */
function select(name: string): void {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
}

function detailsHeading(): HTMLElement {
  return screen.getByRole("heading", { level: 4 });
}

/** The polite region beside "Add component", which says what a remove took. */
function removedRegion(): HTMLElement {
  const region = addButton().parentElement?.querySelector('[role="status"]');
  if (!(region instanceof HTMLElement)) throw new Error("No removed region");
  return region;
}

/** Remove's confirmation, by its question. */
function confirmation(question: string): HTMLElement {
  return screen.getByRole("group", { name: question });
}

const TABLE_QUESTION = "Remove Table and its edge from Function?";

describe("OpenedProject's adding and removing components", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if an add doesn't save, doesn't select the new component, or
  // leaves the focus anywhere but its name field, with the name selected
  // so typing replaces it.
  it("adds a component, saves it, and focuses its name", async () => {
    const { projects } = renderOpenedProject();

    add("DynamoDB");

    const saved = await savedRecord(projects, (r) =>
      componentIds(r).includes("new-1"),
    );
    expect(saved.project.architecture.components.at(-1)?.name).toBe(
      "dynamodb-1",
    );
    expect(detailsHeading().textContent).toBe("dynamodb-1 · DynamoDB");
    const name = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Name",
    });
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 10]);
    expect(screen.getByText(/^Called by: nothing yet\./).textContent).toContain(
      "A component does nothing until a workflow step calls it.",
    );
  });

  // Fails if the confirmation doesn't name the component's edge or count
  // the steps calling it, or the remove doesn't save, keeps the edge,
  // leaves the selection, or loses the focus; or if the workload whose
  // workflow called it isn't stopped, with the reason, after it.
  it("confirms a remove, then saves it, and the workload can't run", async () => {
    const { projects } = renderOpenedProject();
    select("Table (dynamodb)");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const asking = confirmation(TABLE_QUESTION);
    expect(asking.textContent).toContain(
      "1 workflow step calls it, and won't run until you change it.",
    );
    expect(document.activeElement).toBe(
      within(asking).getByRole("button", { name: "Cancel" }),
    );
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));

    const saved = await savedRecord(
      projects,
      (r) => !componentIds(r).includes("table"),
    );
    expect(saved.project.architecture.edges.map((e) => e.id)).toEqual([
      "api-fn",
    ]);
    expect(saved.project.workflows).toEqual(sampleRecord.project.workflows);
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
    expect(document.activeElement).toBe(addButton());
    expect(cantRunRegion().textContent).toBe(
      "Steady can't run yet: Read item calls a component that isn't in the architecture any more.",
    );
  });

  // Fails if a remove isn't announced, or is announced from a region that
  // appears with its text in it, which many screen readers skip (UX §4.4).
  it("announces a remove from a region that was there, empty, before", () => {
    renderOpenedProject();
    const region = removedRegion();
    expect(region.textContent).toBe("");
    select("Function (lambda)");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const asking = screen.getByRole("group", { name: /^Remove Function/ });
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));

    expect(removedRegion()).toBe(region);
    expect(region.textContent).toBe("Removed Function.");
  });

  // Fails if Cancel or Escape removes anything, Escape also closes
  // Details, or the focus isn't returned to Remove.
  it("keeps the component on Cancel or Escape", () => {
    renderOpenedProject();
    select("Table (dynamodb)");
    const remove = () => screen.getByRole("button", { name: "Remove" });

    fireEvent.click(remove());
    fireEvent.click(
      within(confirmation(TABLE_QUESTION)).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(document.activeElement).toBe(remove());

    fireEvent.click(remove());
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("group", { name: TABLE_QUESTION })).toBeNull();
    expect(document.activeElement).toBe(remove());
    expect(detailsHeading().textContent).toBe("Table · DynamoDB");
    expect(
      screen.getByRole("button", { name: "Table (dynamodb)" }),
    ).toBeTruthy();
  });
});
