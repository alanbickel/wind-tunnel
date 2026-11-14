// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SAMPLE_QUEUE,
  SAMPLE_WRITER,
} from "../../application/testing/sample-queue";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Project, Step } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  renderOpenedProject as renderProject,
  savedRecord,
} from "./testing/render-opened-project";

// The sample (API → Function → Table) with a queue, "Queue" (SQS), and a
// second function, "Writer", and an edge Function → Queue. The queue has no
// edge to the writer, nor the writer to the table, unless a test draws them
// (`withEdges`), since async work and calls go only along edges. "Orders" is 1 API > 1.1 Function > 1.1.1 Queue
// (enqueue), with the async work the test gives it.

import { revealButton } from "./testing/canvas-panels";

const QUEUE_EDGE = {
  id: "fn-queue",
  from: "fn",
  to: "queue",
  latencyMs: 1,
  timeoutMs: 1_000,
  retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
} as const;

const step = (id: string, rest: Partial<Step> = {}): Step => ({
  id,
  componentId: "table",
  action: "read",
  ...rest,
});

/** The project with an "Orders" workflow whose queue step is given. */
function ordersWith(queueStep: Partial<Step>): Project {
  const { architecture } = sampleRecord.project;
  const root = step("api-step", {
    componentId: "api",
    action: "invoke",
    calls: [
      step("fn-step", {
        componentId: "fn",
        action: "invoke",
        calls: [
          step("queue-step", {
            componentId: "queue",
            action: "enqueue",
            ...queueStep,
          }),
        ],
      }),
    ],
  });
  return {
    ...sampleRecord.project,
    architecture: {
      components: [...architecture.components, SAMPLE_QUEUE, SAMPLE_WRITER],
      edges: [...architecture.edges, QUEUE_EDGE],
    },
    workflows: [{ id: "orders", name: "Orders", root }],
  };
}

/** The project with edges between its components, as "Connect to…" would draw them. */
function withEdges(project: Project, ...ends: [string, string][]): Project {
  const edges = ends.map(([from, to]) => ({
    ...QUEUE_EDGE,
    id: `${from}-${to}`,
    from,
    to,
  }));
  const { architecture } = project;
  return {
    ...project,
    architecture: { ...architecture, edges: [...architecture.edges, ...edges] },
  };
}

const WRITER_STEP = step("writer-step", {
  componentId: "writer",
  action: "invoke",
});
const ADD_ASYNC = "Add async work, done when a consumer takes the message";

function openOutline(): void {
  const row = revealButton(/^Orders/);
  row.focus();
  fireEvent.click(row);
}

/** The outline's step buttons' text, in order. */
function outlineText(): string[] {
  const outline = screen.getByRole("list", { name: "Steps" });
  return within(outline)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => /^[0-9]/.test(text));
}

function detailsStatus(): HTMLElement {
  const details = screen.getByRole("region", { name: "Details" });
  return within(details).getByRole("status");
}

function pick(label: string, value: string): void {
  fireEvent.change(screen.getByRole("combobox", { name: label }), {
    target: { value },
  });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

function undo(): void {
  fireEvent.click(undoButton());
}

/** The text of what describes an element: its aria-describedby, all of it. */
function descriptionOf(element: HTMLElement): string[] {
  const ids = (element.getAttribute("aria-describedby") ?? "").split(" ");
  return ids.map((id) => document.getElementById(id)?.textContent ?? "");
}

/** The button that opens the slot's draft, for the step with this number. */
function slotButton(number: string): HTMLElement {
  return screen.getByRole("button", { name: `${ADD_ASYNC}, step ${number}` });
}

describe("OpenedProject's async work under an enqueue", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if an enqueue with no async work lacks the heading, the words for
  // an empty slot, or its button; or a step that isn't an enqueue, or one
  // that has async work, offers the slot.
  it("shows the slot only on an enqueue with none, with its words", () => {
    renderProject({ project: ordersWith({}) });
    openOutline();

    expect(
      screen.getByText("Async work, done when a consumer takes the message"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No async work yet. A message is taken off the queue and nothing runs.",
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^Add async work/ }),
    ).toHaveLength(1);
    expect(slotButton("1.1.1")).toBeTruthy();
    // Fails if the empty slot isn't a group named by its heading, so a
    // screen reader reaching the button doesn't hear what the slot is.
    const group = screen.getByRole("group", {
      name: "Async work, done when a consumer takes the message",
    });
    expect(within(group).getByText(/^No async work yet/)).toBeTruthy();
    expect(
      within(group).getByRole("button", { name: /^Add async work/ }),
    ).toBeTruthy();
    cleanup();

    renderProject({ project: ordersWith({ async: WRITER_STEP }) });
    openOutline();
    expect(
      screen.queryByRole("button", { name: /^Add async work/ }),
    ).toBeNull();
    expect(screen.queryByText(/^No async work yet/)).toBeNull();
  });

  // Fails if an enqueue under async work gets no slot: chained queues are
  // modeled (ADR-0021 decision 1.4).
  it("gives an enqueue under async work a slot like any other", () => {
    const chained = step("writer-step", {
      componentId: "writer",
      action: "invoke",
      calls: [step("inner", { componentId: "queue", action: "enqueue" })],
    });
    renderProject({ project: ordersWith({ async: chained }) });
    openOutline();

    expect(slotButton("1.1.1.1.1")).toBeTruthy();
  });

  // Fails if the draft doesn't take the focus, offers a component the queue
  // has no edge to (the table, the function), or doesn't offer the one it
  // has, or saves before both are chosen.
  it("opens a draft offering only the queue's neighbours, and saves nothing until both are chosen", () => {
    renderProject({
      project: withEdges(
        ordersWith({}),
        ["queue", "writer"],
        ["queue", "table"],
      ),
    });
    openOutline();
    fireEvent.click(slotButton("1.1.1"));

    const picker = screen.getByRole("combobox", { name: "Component" });
    expect(document.activeElement).toBe(picker);
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a component", "Writer (Lambda)", "Table (DynamoDB)"]);

    pick("Component", "table");

    expect(screen.getByRole("combobox", { name: "Action" })).toBeTruthy();
    expect(outlineText()).toHaveLength(3);
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if a queue with no edge to any consumer gets pickers with
  // nothing to pick, or the draft doesn't say how to connect it.
  it("says how to connect a queue that has no edge to a consumer", () => {
    renderProject({ project: ordersWith({}) });
    openOutline();

    fireEvent.click(slotButton("1.1.1"));

    expect(screen.queryByRole("combobox", { name: "Component" })).toBeNull();
    const group = screen.getByRole("group", { name: ADD_ASYNC });
    expect(group.textContent).toContain("Queue has no edges to call along.");
    expect(group.textContent).toContain("Connect to…");
  });

  // Fails if choosing a component with one action doesn't save the async
  // root, select and focus the new step, announce it, name Undo for it,
  // or save the record; or the command adds an edge; or Undo leaves the
  // slot filled.
  it("saves the async root along the queue's edge, announces it, and undoes it", async () => {
    const { projects } = renderProject({
      project: withEdges(ordersWith({}), ["queue", "writer"]),
    });
    openOutline();
    fireEvent.click(slotButton("1.1.1"));

    pick("Component", "writer");

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Queue · enqueue",
      "1.1.1.1 Writer · invoke",
    ]);
    const added = screen.getByRole("button", { name: /^1\.1\.1\.1 Writer/ });
    expect(added.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(added);
    expect(detailsStatus().textContent).toBe(
      "Added async work from Queue to Writer.",
    );
    const saved = await savedRecord(
      projects,
      (r) =>
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.async !==
        undefined,
    );
    expect(saved.project.architecture.edges).toHaveLength(4);
    expect(screen.queryByText(/^No async work yet/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Undo add async work from Queue to Writer",
      }),
    );

    // The undo took the selected step away, which clears the selection.
    openOutline();
    expect(outlineText()).toHaveLength(3);
    expect(screen.getByText(/^No async work yet/)).toBeTruthy();
  });

  // Fails if Escape saves the draft, leaves it open, or doesn't return the
  // focus to the button; or Escape also closes Details.
  it("drops the draft on Escape, saving nothing", () => {
    renderProject({
      project: withEdges(ordersWith({}), ["queue", "writer"]),
    });
    openOutline();
    fireEvent.click(slotButton("1.1.1"));

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Component" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("combobox", { name: "Component" })).toBeNull();
    expect(document.activeElement).toBe(slotButton("1.1.1"));
    expect(outlineText()).toHaveLength(3);
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("list", { name: "Steps" })).toBeTruthy();
  });
});

describe("OpenedProject's editing the async tree", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the async root has Move up or Move down, loses Remove, or its
  // line doesn't say when it runs (the description a screen reader hears).
  it("gives the async root Remove and a description, and no Move", () => {
    renderProject({ project: ordersWith({ async: WRITER_STEP }) });
    openOutline();

    const line = screen.getByRole("button", { name: /^1\.1\.1\.1 Writer/ });
    expect(descriptionOf(line)).toContain(
      "Runs when a consumer takes the message from Queue.",
    );
    expect(
      screen.getByRole("button", { name: "Remove 1.1.1.1 Writer · invoke" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Move .* 1\.1\.1\.1/ }),
    ).toBeNull();
  });

  // Fails if Remove on the async root asks when nothing is under it, takes
  // an edge, leaves the slot filled, selects anything but the queue step
  // and focuses anything but its line, announces anything but that the
  // queue has no async work now, or if Undo doesn't bring the root back.
  it("removes the async root at once, leaving the slot empty and the edge", async () => {
    const { projects } = renderProject({
      project: ordersWith({ async: WRITER_STEP }),
    });
    openOutline();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove 1.1.1.1 Writer · invoke" }),
    );

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Queue · enqueue",
    ]);
    const queue = screen.getByRole("button", { name: /^1\.1\.1 Queue/ });
    expect(queue.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(queue);
    expect(detailsStatus().textContent).toBe(
      "Removed Writer · invoke. Queue · enqueue has no async work now.",
    );
    expect(screen.getByText(/^No async work yet/)).toBeTruthy();
    const saved = await savedRecord(
      projects,
      (r) =>
        r.project.workflows[0]?.root.calls?.[0]?.calls?.[0]?.async ===
        undefined,
    );
    expect(saved.project.architecture.edges).toHaveLength(3);

    undo();

    expect(outlineText()).toHaveLength(4);
  });

  // Fails if Remove on an async root with steps under it doesn't ask first,
  // or doesn't count them.
  it("asks before removing an async root that has steps under it", () => {
    const withCall = { ...WRITER_STEP, calls: [step("below")] };
    renderProject({ project: ordersWith({ async: withCall }) });
    openOutline();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove 1.1.1.1 Writer · invoke" }),
    );

    expect(
      screen.getByText("Remove Writer · invoke and the 1 call under it?"),
    ).toBeTruthy();
    expect(outlineText()).toHaveLength(5);
  });

  // Fails if a call can't be added under the async root, or a step below it
  // can't be removed on its own.
  it("adds under the async root", () => {
    renderProject({
      project: withEdges(ordersWith({ async: WRITER_STEP }), [
        "writer",
        "table",
      ]),
    });
    openOutline();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a call from Writer, step 1.1.1.1",
      }),
    );
    pick("Component", "table");
    pick("Action", "read");

    expect(outlineText()).toEqual([
      "1 API · invoke",
      "1.1 Function · invoke",
      "1.1.1 Queue · enqueue",
      "1.1.1.1 Writer · invoke",
      "1.1.1.1.1 Table · read",
    ]);
  });
});

describe("OpenedProject's older projects with async work in the wrong place", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** "Orders" with async work on a `read` step, which only an `enqueue` can have. */
  function asyncOnRead(): Project {
    const project = ordersWith({});
    const { workflows } = project;
    const [orders] = workflows;
    if (orders === undefined) throw new Error("no workflow");
    const root: Step = {
      ...orders.root,
      calls: [
        step("fn-step", {
          componentId: "fn",
          action: "invoke",
          calls: [step("read-step", { async: WRITER_STEP })],
        }),
      ],
    };
    return { ...project, workflows: [{ ...orders, root }] };
  }

  // Fails if `async-not-on-enqueue` doesn't show on the step that has the
  // async work, or Remove on the async root leaves it.
  it("shows async-not-on-enqueue on the step, and Remove on the root fixes it", () => {
    renderProject({ project: asyncOnRead() });
    openOutline();

    expect(
      screen.getByText(
        'This step gives async work to a "read" step; only "enqueue" steps can have it.',
        { exact: false },
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove 1.1.1.1 Writer · invoke" }),
    );

    expect(screen.queryByText(/only "enqueue" steps can have it/)).toBeNull();
  });

  // Fails if changing the step's action leaves async-not-on-enqueue, or
  // drops the async work without asking.
  it("is fixed by changing the action, which asks first", () => {
    renderProject({ project: asyncOnRead() });
    openOutline();
    fireEvent.click(
      screen.getByRole("button", { name: /^1\.1\.1 Table · read/ }),
    );

    pick("Action", "write");

    expect(screen.getByText(/The 1 step under it goes\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByText(/only "enqueue" steps can have it/)).toBeNull();
  });

  // Fails if `async-not-delivered` doesn't show on the step whose component
  // can't deliver async work.
  it("shows async-not-delivered on the step", () => {
    const project = ordersWith({ componentId: "fn", async: WRITER_STEP });
    renderProject({ project });
    openOutline();

    expect(
      screen.getByText(
        "This step gives Function async work to deliver, but only queue-like components can deliver it.",
      ),
    ).toBeTruthy();
  });
});
