// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Edge, Project } from "../../domain/model/project";
import {
  SAMPLE_QUEUE,
  SAMPLE_WRITER,
} from "../../application/testing/sample-queue";
import {
  stubArrowDrawing,
  stubDiagramBrowserApis,
} from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { revealButton, railRegion } from "./testing/canvas-panels";
import {
  renderOpenedProject as renderProject,
  savedRecord,
} from "./testing/render-opened-project";

// The sample's "Read item": 1 API > 1.1 Function > 1.1.1 Table (read). The
// architecture has API → Function and Function → Table, and no API → Table.
// Function's type accepts one action, and Table's two (read and write).

function selectReadItem(): void {
  const row = revealButton(/^Read item/);
  row.focus();
  fireEvent.click(row);
}

/** Waits until React Flow has drawn the arrows, so an absent offer is absent, not late. */
async function arrowsDrawn(): Promise<void> {
  await waitFor(() => {
    expect(
      document.querySelectorAll(".react-flow__edge").length,
    ).toBeGreaterThan(0);
  });
}

/** An arrow's offer, once React Flow has drawn the arrow. */
function offerOn(name: string): Promise<HTMLElement> {
  return screen.findByRole("button", { name });
}

function stepsOnScreen(): string[] {
  const outline = screen.getByRole("list", { name: "Steps" });
  return within(outline)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => /^[0-9]/.test(text));
}

function pick(label: string, value: string): void {
  fireEvent.change(screen.getByRole("combobox", { name: label }), {
    target: { value },
  });
}

function undo(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));
}

/** The sample, with "Read item" calling the Function twice: 1.1 and 1.2. */
const functionTwice: Project = {
  ...sampleRecord.project,
  workflows: [
    {
      id: "read",
      name: "Read item",
      root: {
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [
          { id: "fn-1", componentId: "fn", action: "invoke" },
          { id: "fn-2", componentId: "fn", action: "invoke" },
        ],
      },
    },
  ],
};

const retry: Edge["retry"] = {
  maxAttempts: 1,
  backoff: "none",
  baseDelayMs: 0,
};

/** The sample with a queue after the Function and a consumer after the queue; "Read item" ends at an empty queue. */
const withQueue: Project = {
  ...sampleRecord.project,
  architecture: {
    components: [
      ...sampleRecord.project.architecture.components,
      SAMPLE_QUEUE,
      SAMPLE_WRITER,
    ],
    edges: [
      ...sampleRecord.project.architecture.edges,
      {
        id: "fn-queue",
        from: "fn",
        to: "queue",
        latencyMs: 1,
        timeoutMs: 1_000,
        retry,
      },
      {
        id: "queue-writer",
        from: "queue",
        to: "writer",
        latencyMs: 1,
        timeoutMs: 1_000,
        retry,
      },
    ],
  },
  workflows: [
    {
      id: "read",
      name: "Read item",
      root: {
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [
          {
            id: "fn-invoke",
            componentId: "fn",
            action: "invoke",
            calls: [{ id: "enq", componentId: "queue", action: "enqueue" }],
          },
        ],
      },
    },
  ],
};

describe("OpenedProject's adding a call from an edge's offer", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(() => {
    stubDiagramBrowserApis();
    stubArrowDrawing();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if an offer is drawn with no workflow selected, or when a
  // component or an edge is: the canvas would carry buttons that add a call
  // to nothing.
  it("offers nothing until a workflow is selected", async () => {
    renderProject();
    await arrowsDrawn();

    expect(
      screen.queryByRole("button", { name: /^Add a call from/ }),
    ).toBeNull();
  });

  // Fails if each edge leaving a box in the path doesn't offer, named for
  // the two components it joins, or an edge the path already uses doesn't
  // (a step can call the same component twice).
  it("offers each edge that leaves a box in the path, named for what it does", async () => {
    renderProject();
    selectReadItem();

    expect(await offerOn("Add a call from API to Function")).toBeTruthy();
    expect(await offerOn("Add a call from Function to Table")).toBeTruthy();
  });

  // Fails if a target with one action asks anything (the call would wait
  // for a picker with one option), or the call isn't added under the edge's
  // source step as one saved, named, announced step, or an edge is added.
  it("adds a call at once when the target accepts one action, with no edge added", async () => {
    const { projects } = renderProject();
    selectReadItem();

    fireEvent.click(await offerOn("Add a call from API to Function"));

    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
      "1.2 Function · invoke",
    ]);
    expect(railRegion("component").textContent).toBe(
      "Added a call from API to Function.",
    );
    expect(
      screen.getByRole("button", {
        name: "Undo add a call from API to Function",
      }),
    ).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.length === 2,
    );
    expect(saved.project.architecture.edges).toEqual(
      sampleRecord.project.architecture.edges,
    );
  });

  // Fails if one Undo leaves the call behind, or takes anything else with
  // it (two steps would go), or the edge goes with it.
  it("undoes the call in one step", async () => {
    const { projects } = renderProject();
    selectReadItem();
    fireEvent.click(await offerOn("Add a call from API to Function"));

    undo();

    selectReadItem();
    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
    ]);
    const saved = await savedRecord(
      projects,
      (r) => r.project.workflows[0]?.root.calls?.length === 1,
    );
    expect(saved.project.architecture.edges).toHaveLength(2);
  });

  // Fails if a target with several actions adds before one is chosen, asks
  // with no name for what it is asking, adds with another action than the
  // one chosen, or leaves the popover open once it has saved.
  it("asks which action when the target accepts several, then adds under the source step", async () => {
    const { projects } = renderProject();
    selectReadItem();

    fireEvent.click(await offerOn("Add a call from Function to Table"));

    expect(stepsOnScreen()).toHaveLength(3);
    const question = screen.getByRole("group", {
      name: "Add a call from Function to Table",
    });
    expect(
      within(question).queryByRole("combobox", { name: "Under step" }),
    ).toBeNull();
    pick("Action", "write");

    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Table · read",
      "1.1.2 Table · write",
    ]);
    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
    await savedRecord(
      projects,
      (r) =>
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[1]?.action === "write",
    );
  });

  // Fails if opening the question doesn't move the focus into it (it would
  // stay on the button, out of reach of Escape's group), or Escape adds a
  // call, leaves the question open, or loses the focus from the button.
  it("adds nothing on Escape, and returns the focus to the offer", async () => {
    renderProject();
    selectReadItem();
    const button = await offerOn("Add a call from Function to Table");
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Action" }),
    );

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(screen.queryByRole("group", { name: /^Add a call/ })).toBeNull();
    expect(stepsOnScreen()).toHaveLength(3);
    expect(document.activeElement).toBe(button);
  });

  // Fails if the offer picks a step on its own when the box is in the path
  // twice and none is selected (the call would go under the wrong one), or
  // doesn't ask which in the popover, naming each by its place.
  it("asks which step when the edge's box is in the path twice and none is selected", async () => {
    renderProject({ project: functionTwice });
    selectReadItem();

    fireEvent.click(await offerOn("Add a call from Function to Table"));

    const picker = screen.getByRole("combobox", { name: "Under step" });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Choose a step",
      "1.1 Function · invoke",
      "1.2 Function · invoke",
    ]);
    pick("Under step", "fn-2");
    pick("Action", "read");

    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.2 Function · invoke",
      "1.2.1 Table · read",
    ]);
  });

  // Fails if a selected step on the edge's box doesn't get the call without
  // being asked, so the popover asks what the selection already says.
  it("puts the call under the selected step without asking which", async () => {
    renderProject({ project: functionTwice });
    selectReadItem();
    fireEvent.click(screen.getByRole("button", { name: /^1\.2 Function/ }));

    fireEvent.click(await offerOn("Add a call from Function to Table"));
    const question = screen.getByRole("group", {
      name: "Add a call from Function to Table",
    });
    // The selected step's own pickers are in Details, so ask the popover.
    fireEvent.change(
      within(question).getByRole("combobox", { name: "Action" }),
      {
        target: { value: "read" },
      },
    );

    expect(screen.queryByRole("combobox", { name: "Under step" })).toBeNull();
    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.2 Function · invoke",
      "1.2.1 Table · read",
    ]);
  });

  // Fails if an edge leaving a queue with an empty slot adds a call instead
  // of the async work (the outline's slot would stay empty), or isn't named
  // and undone as async work.
  it("adds async work on an edge from an enqueue whose slot is empty", async () => {
    renderProject({ project: withQueue });
    selectReadItem();

    fireEvent.click(await offerOn("Add async work from Queue to Writer"));

    expect(stepsOnScreen()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Queue · enqueue",
      "1.1.1.1 Writer · invoke",
    ]);
    expect(
      screen.getByRole("button", {
        name: "Undo add async work from Queue to Writer",
      }),
    ).toBeTruthy();
    expect(railRegion("component").textContent).toBe(
      "Added async work from Queue to Writer.",
    );
  });

  // Fails if an edge leaving a queue whose slot is filled still offers: the
  // outline offers no call under an enqueue.
  it("offers nothing on an edge from an enqueue whose slot is filled", async () => {
    renderProject({ project: withQueue });
    selectReadItem();
    fireEvent.click(await offerOn("Add async work from Queue to Writer"));
    selectReadItem();
    await arrowsDrawn();

    expect(
      screen.queryByRole("button", { name: /^Add async work from/ }),
    ).toBeNull();
  });
});
