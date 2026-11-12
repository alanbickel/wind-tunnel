// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_NAME_TAKEN } from "../../application/details/project-name";
import { awsSaveProject } from "../../application/testing/aws-save-project";
import { InMemoryProjectRepository } from "../../application/testing/in-memory-project-repository";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  clickRun,
  renderOpenedProject,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

function countedSaves() {
  const projects = new InMemoryProjectRepository();
  const saveProject = awsSaveProject(projects);
  const execute = vi.spyOn(saveProject, "execute");
  return { projects, saveProject, execute };
}

/**
 * The input's `onBlur` as it is now. A browser fires `blur` as it removes
 * the focused input, and runs that handler; jsdom and React don't, so a test
 * keeps the handler and calls it after the input has gone.
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

describe("OpenedProject rename", () => {
  beforeEach(() => {
    stubDiagramBrowserApis();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the name button's aria-label stops starting with "Rename ", or
  // stops containing the visible name (WCAG 2.5.3), or the heading stops
  // being named by the project name alone.
  it('names the name button "Rename <name>" inside a heading named for the project', () => {
    renderOpenedProject();

    const heading = screen.getByRole("heading", { name: "Sample project" });
    const button = screen.getByRole("button", { name: /^Rename / });

    expect(heading.contains(button)).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Rename Sample project");
    expect(button.textContent).toBe("Sample project");
  });

  // Fails if pressing Enter on a valid project rename doesn't save through the
  // queue, doesn't update the heading, doesn't notify the breadcrumb, or fails
  // to return focus to the name button (found by its "Rename " label).
  it("saves the new name on Enter, updates heading and breadcrumb, and focuses Rename", async () => {
    const onProjectNameChange = vi.fn<(name: string) => void>();
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject, onProjectNameChange });

    const renameButton = screen.getByRole("button", { name: /^Rename / });
    fireEvent.click(renameButton);

    const input = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "Project name",
    });
    expect(input.value).toBe("Sample project");
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Project name" }),
      ).toBeNull();
    });

    expect(screen.getByRole("heading", { name: "Orders API" })).toBeTruthy();
    expect(onProjectNameChange).toHaveBeenCalledWith("Orders API");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Rename / }),
    );

    await waitFor(() => {
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  // Fails if pressing Escape commits the draft name or fails to restore the heading and focus to Rename.
  it("puts back the old name on Escape and saves nothing", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });

    fireEvent.change(input, { target: { value: "Cancelled Name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Rename / }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  // Fails if an empty project name commits, lacks aria-invalid, or is not tied to the error message.
  it("shows 'A project needs a name.' on an empty name and saves nothing", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("A project needs a name.")).toBeTruthy();
    });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = screen.getByText("A project needs a name.");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    expect(execute).not.toHaveBeenCalled();
  });

  // Fails if a clash with another project's name commits or doesn't show the clash error,
  // or if changing only the case of the project's own name is rejected.
  it("shows clash message for another project's name and accepts case change of own name", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    await projects.save({
      ...sampleRecord,
      project: { ...sampleRecord.project, id: "other", name: "Other Project" },
    });
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });

    fireEvent.change(input, { target: { value: "other project" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(PROJECT_NAME_TAKEN)).toBeTruthy();
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(execute).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "SAMPLE PROJECT" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Project name" }),
      ).toBeNull();
    });

    expect(
      screen.getByRole("heading", { name: "SAMPLE PROJECT" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  // Fails if the Undo button label does not include both the old and new project names after a rename.
  it("names the rename with old and new names on the Undo button", async () => {
    const { projects, saveProject } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Orders API" })).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Undo rename Sample project to Orders API",
      }),
    ).toBeTruthy();
  });

  // Fails if renaming a project marks a completed run out of date.
  it("leaves the run current after a rename without showing 'Out of date'", async () => {
    const { projects, saveProject } = countedSaves();
    await projects.save(sampleRecord);
    const rendered = renderOpenedProject({ projects, saveProject });

    clickRun();
    rendered.runner.send(sampleSnapshot({ second: 1 }));
    await rendered.runner.finish();

    const [, outOfDate] = statusRegions();
    expect(outOfDate.textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Renamed Project" }),
      ).toBeTruthy();
    });

    expect(outOfDate.textContent).toBe("");
  });

  // Fails if undoing a rename doesn't restore the original name to the heading and breadcrumb.
  it("puts the old name back in heading and breadcrumb after undo", async () => {
    const onProjectNameChange = vi.fn<(name: string) => void>();
    const { projects, saveProject } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject, onProjectNameChange });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Orders API" })).toBeTruthy();
    });

    const undoButton = screen.getByRole("button", {
      name: "Undo rename Sample project to Orders API",
    });
    fireEvent.click(undoButton);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Sample project" }),
      ).toBeTruthy();
    });

    expect(onProjectNameChange).toHaveBeenLastCalledWith("Sample project");
    expect(undoneRegion().textContent).toBe(
      "Undid: rename Sample project to Orders API.",
    );
  });

  // Fails if leaving the field doesn't save the new name exactly once, or
  // doesn't send the focus to "Rename".
  it("saves the new name once when the field is left, and focuses Rename", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.blur(input);

    expect(screen.getByRole("heading", { name: "Orders API" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Rename / }),
    );
    await waitFor(() => {
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  // Fails if the blur a browser fires as Escape removes the focused input
  // saves the draft Escape meant to drop (the test runs the input's handler after it has gone).
  it("saves nothing when Escape is followed by a blur", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Cancelled Name" } });
    const blur = blurHandlerOf(input);
    fireEvent.keyDown(input, { key: "Escape" });
    blur();

    expect(
      screen.getByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
  });

  // Fails if the name isn't trimmed before the command, so "  Sample project "
  // is saved as a new name.
  it("saves nothing when the name is unchanged", async () => {
    const { projects, saveProject, execute } = countedSaves();
    await projects.save(sampleRecord);
    renderOpenedProject({ projects, saveProject });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "  Sample project " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      screen.getByRole("heading", { name: "Sample project" }),
    ).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if Redo after Undo doesn't send the new name to the breadcrumb.
  it("puts the new name back in the breadcrumb after redo", async () => {
    const onProjectNameChange = vi.fn<(name: string) => void>();
    renderOpenedProject({ onProjectNameChange });

    fireEvent.click(screen.getByRole("button", { name: /^Rename / }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Orders API" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Undo rename Sample project to Orders API",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Redo rename Sample project to Orders API",
      }),
    );

    expect(screen.getByRole("heading", { name: "Orders API" })).toBeTruthy();
    expect(onProjectNameChange.mock.calls.map(([name]) => name)).toEqual([
      "Orders API",
      "Sample project",
      "Orders API",
    ]);
  });
});
