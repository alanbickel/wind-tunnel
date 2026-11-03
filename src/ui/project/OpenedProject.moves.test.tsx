// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awsSaveProject } from "../../application/testing/aws-save-project";
import { InMemoryProjectRepository } from "../../application/testing/in-memory-project-repository";
import type { ProjectRecord } from "../../application/ports/project-record";
import { dragNode, mouse } from "../diagram/testing/drag-node";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import {
  clickRun,
  renderOpenedProject,
  savedRecord,
  statusRegions,
} from "./testing/render-opened-project";

/** A box on the diagram, once React Flow has drawn it. */
async function drawnNode(componentId: string): Promise<HTMLElement> {
  const selector = `.react-flow__node[data-id="${componentId}"]`;
  await waitFor(() => {
    expect(document.querySelector(selector)).not.toBeNull();
  });
  return document.querySelector(selector) as HTMLElement;
}

/** The real save over memory, with a spy on each save. */
function countedSaves() {
  const projects = new InMemoryProjectRepository();
  const saveProject = awsSaveProject(projects);
  const execute = vi.spyOn(saveProject, "execute");
  return { projects, saveProject, execute };
}

/** Clicks a box as a user does: the mouse pressed and let go, then the click. */
function clickNode(box: HTMLElement): void {
  mouse({ target: box, type: "mouseDown", point: [10, 10] });
  mouse({ target: document, type: "mouseUp", point: [10, 10] });
  fireEvent.click(box);
}

/** The polite region beside "Add component", which says what a move did. */
function movedRegion(): HTMLElement {
  const addButton = screen.getByRole("button", { name: "Add component" });
  const region = addButton.parentElement?.querySelector('[role="status"]');
  if (!(region instanceof HTMLElement)) throw new Error("No moved region");
  return region;
}

const fnAt = (x: number, y: number) => (record: ProjectRecord) =>
  record.layout.nodes.fn?.x === x && record.layout.nodes.fn.y === y;

describe("OpenedProject's moves", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // After a drag, d3-drag swallows the window's next click until a
    // zero-delay timeout; let it run, or the next test's click is lost.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  // Fails if the end of a drag doesn't save the box's new place, saves it
  // more than once, or a click that doesn't move a box saves anything, as
  // reporting a move from a click, or saving a selection, would.
  it("saves a drag's end once, and nothing for a click", async () => {
    const { projects, saveProject, execute } = countedSaves();
    renderOpenedProject({ saveProject });
    const fn = await drawnNode("fn");

    clickNode(await drawnNode("table"));
    dragNode({ box: fn, by: [40, 60] });

    const saved = await savedRecord(projects, fnAt(290, 60));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(saved.layout.nodes).toEqual({
      api: { x: 0, y: 0 },
      fn: { x: 290, y: 60 },
      table: { x: 500, y: 0 },
    });
  });

  // Fails if each arrow key press saves, rather than the run of them, or
  // the save doesn't hold the last press's position.
  it("saves a run of arrow key presses once, with the final position", async () => {
    const { projects, saveProject, execute } = countedSaves();
    renderOpenedProject({ saveProject });
    const fn = await drawnNode("fn");

    fn.focus();
    fireEvent.keyDown(fn, { key: "ArrowRight" });
    fireEvent.keyDown(fn, { key: "ArrowRight" });
    fireEvent.keyDown(fn, { key: "ArrowDown", shiftKey: true });
    fireEvent.blur(fn);

    await savedRecord(projects, fnAt(260, 20));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // Fails if a move isn't announced, though the canvas says nothing to a
  // screen reader, or is announced for each press rather than the run.
  it("announces a run of arrow key presses once, by the component's name", async () => {
    renderOpenedProject();
    const fn = await drawnNode("fn");
    const region = movedRegion();

    fn.focus();
    fireEvent.keyDown(fn, { key: "ArrowRight" });
    fireEvent.keyDown(fn, { key: "ArrowRight" });
    expect(region.textContent).toBe("");
    fireEvent.blur(fn);

    expect(region.textContent).toBe("Moved Function.");
  });

  // Fails if the screen draws a box where the template's layout has it,
  // not where the saved layout puts it, so a move is lost on reopening.
  it("draws a moved box where it was put once the project opens again", async () => {
    const { projects, saveProject } = countedSaves();
    renderOpenedProject({ saveProject });
    dragNode({ box: await drawnNode("fn"), by: [40, 60] });
    const saved = await savedRecord(projects, fnAt(290, 60));
    cleanup();

    renderOpenedProject({ layout: saved.layout });

    expect((await drawnNode("fn")).style.transform).toBe(
      "translate(290px,60px)",
    );
  });

  // Fails if a move counts as a change to the model (ADR-0018): the run
  // on screen would say it's out of date, though nothing it ran changed.
  it("leaves the run current after a move", async () => {
    const { projects, saveProject } = countedSaves();
    const { runner } = renderOpenedProject({ saveProject });
    clickRun();
    await runner.finish();

    dragNode({ box: await drawnNode("fn"), by: [40, 60] });
    await savedRecord(projects, fnAt(290, 60));

    expect(statusRegions()[1].textContent).toBe("");
    expect(screen.queryByText(/earlier version of the project/)).toBeNull();
  });
});
