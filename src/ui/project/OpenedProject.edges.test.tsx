// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Edge } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  cantRunRegion,
  detailsHeading,
  renderOpenedProject,
  savedRecord,
} from "./testing/render-opened-project";

import { revealButton } from "./testing/canvas-panels";

/** Selects a component or a connection from the diagram's text version. */
function select(name: string): void {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
}

/** Details' "Connect" button, beside "Connect to…". */
function connectButton(): HTMLElement {
  return screen.getByRole("button", { name: "Connect" });
}

function edgeOf(
  record: ProjectRecord,
  from: string,
  to: string,
): Edge | undefined {
  return record.project.architecture.edges.find(
    (e) => e.from === from && e.to === to,
  );
}

/** Details' polite region, which says what a field or Connect did. */
function detailsRegion(): HTMLElement {
  const heading = detailsHeading();
  const region = heading
    .closest("div[class]")
    ?.parentElement?.querySelector(':scope > [role="status"]');
  if (!(region instanceof HTMLElement)) throw new Error("No Details region");
  return region;
}

/** Types into a field and leaves it, as a user would. */
function enter(field: HTMLElement, text: string): void {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
}

const FN_TO_TABLE = "Function → Table";

/** The canvas's line on how to connect boxes, if it's there. */
function connectLine(): HTMLElement | null {
  return screen.queryByText(
    "Drag from a box’s handle to another box to connect them",
  );
}

describe("OpenedProject's edges", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if "Connect to…" offers the component itself or one it already
  // reaches, if choosing one doesn't save an edge with the caller type's
  // defaults, or if the connection isn't announced; or if connecting the
  // last one leaves the focus on <body>, outside Details.
  it("connects a component from Connect to…, and saves the edge", async () => {
    const { projects } = renderOpenedProject();
    select("Function (Lambda)");
    const picker = screen.getByRole("combobox", { name: "Connect to" });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["API (API Gateway)"]);

    fireEvent.click(connectButton());

    const saved = await savedRecord(projects, (r) =>
      Boolean(edgeOf(r, "fn", "api")),
    );
    expect(edgeOf(saved, "fn", "api")).toMatchObject({
      id: "edge-1",
      latencyMs: 1,
      timeoutMs: 5_000,
    });
    expect(detailsRegion().textContent).toBe("Connected Function to API.");
    expect(screen.queryByRole("combobox", { name: "Connect to" })).toBeNull();
    expect(document.activeElement?.textContent).toBe(
      "Connected to every other component already.",
    );
    expect(revealButton("Function → API")).toBeTruthy();
  });

  // Fails if the line takes the focus whenever it mounts, not only after
  // Connect connects the last one.
  it("leaves the focus on the heading when selecting a component that's connected to every other", () => {
    renderOpenedProject();
    select("Function (Lambda)");
    fireEvent.click(connectButton());
    select("Table (DynamoDB)");

    select("Function (Lambda)");

    expect(
      screen.getByText("Connected to every other component already."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(detailsHeading());
  });

  // Fails if an edge's timeout field doesn't check its draft (0 would save
  // a project that can't open), or Reset doesn't put back the caller
  // type's default: 29,000 ms from API Gateway, where the callee, a Lambda,
  // would give 5,000 ms.
  it("holds a timeout of 0 with its message, and resets to the caller type's default", async () => {
    const { projects } = renderOpenedProject();
    select("API → Function");
    const timeout = screen.getByRole("textbox", { name: "Timeout" });

    enter(timeout, "0");

    expect(timeout.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByRole("textbox", {
        name: "Timeout",
        description: /^Timeout must be more than 0./,
      }),
    ).toBe(timeout);
    expect((await projects.get(sampleRecord.project.id)).status).toBe(
      "missing",
    );

    enter(timeout, "10000");
    await savedRecord(
      projects,
      (r) => edgeOf(r, "api", "fn")?.timeoutMs === 10_000,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reset to default: Timeout" }),
    );
    const saved = await savedRecord(
      projects,
      (r) => edgeOf(r, "api", "fn")?.timeoutMs === 29_000,
    );
    expect(edgeOf(saved, "api", "fn")?.latencyMs).toBe(1);
  });

  // Fails if the retry field doesn't save the whole policy from its parts.
  it("saves a retry policy from its parts", async () => {
    const { projects } = renderOpenedProject();
    select(FN_TO_TABLE);

    enter(screen.getByRole("textbox", { name: "Attempts" }), "5");

    const saved = await savedRecord(
      projects,
      (r) => edgeOf(r, "fn", "table")?.retry.maxAttempts === 5,
    );
    expect(edgeOf(saved, "fn", "table")?.retry).toEqual({
      maxAttempts: 5,
      backoff: "exponential",
      baseDelayMs: 50,
    });
  });

  // Fails if the preset can't be picked, shows the SDK's values rather
  // than DynamoDB's, stops being the preset when its attempts change, or
  // stays the preset when its base delay does (ADR-0025 decision 3.4).
  it("picks the AWS SDK standard preset, keeps it for new attempts, and goes custom for a new delay", async () => {
    const { projects } = renderOpenedProject();
    select(FN_TO_TABLE);
    const retries = within(screen.getByRole("group", { name: "Retries" }));
    const mode = retries.getByRole("combobox", { name: "Mode" });

    fireEvent.change(mode, { target: { value: "aws-sdk-standard" } });
    fireEvent.blur(mode);
    await savedRecord(projects, (r) => {
      const retry = edgeOf(r, "fn", "table")?.retry;
      return retry !== undefined && "preset" in retry;
    });
    const attempts = retries.getByRole("textbox", { name: "Attempts" });
    expect((attempts as HTMLInputElement).value).toBe("4");
    expect(retries.getByText(/25 ms after a transient error/)).toBeTruthy();

    enter(attempts, "6");
    const withAttempts = await savedRecord(
      projects,
      (r) => edgeOf(r, "fn", "table")?.retry.maxAttempts === 6,
    );
    expect(edgeOf(withAttempts, "fn", "table")?.retry).toEqual({
      preset: "aws-sdk-standard",
      maxAttempts: 6,
    });

    enter(retries.getByRole("textbox", { name: "Base delay" }), "200");
    const custom = await savedRecord(projects, (r) => {
      const retry = edgeOf(r, "fn", "table")?.retry;
      return retry !== undefined && !("preset" in retry);
    });
    expect(edgeOf(custom, "fn", "table")?.retry).toEqual({
      maxAttempts: 6,
      backoff: "exponential-jitter",
      baseDelayMs: 200,
    });
  });

  // Fails if the confirmation doesn't name the edge's ends or count the
  // steps along it, the remove takes a step with it, or the workload
  // whose workflow calls along it isn't stopped, with the reason.
  it("confirms an edge's remove, naming the steps along it, and the workload can't run", async () => {
    const { projects } = renderOpenedProject();
    select(FN_TO_TABLE);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const asking = screen.getByRole("group", {
      name: "Remove the edge from Function to Table?",
    });
    expect(asking.textContent).toContain(
      "1 workflow step calls along it, and won't run until you change it.",
    );
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));

    const saved = await savedRecord(
      projects,
      (r) => edgeOf(r, "fn", "table") === undefined,
    );
    expect(saved.project.workflows).toEqual(sampleRecord.project.workflows);
    expect(screen.queryByRole("button", { name: FN_TO_TABLE })).toBeNull();
    expect(cantRunRegion().textContent).toBe(
      "Steady can't run yet: Read item calls Table from Function, which has no edge to it.",
    );
  });

  // Fails if the canvas's line on connecting ignores the edges, so it stays
  // once there's one, or isn't drawn: then it isn't there to start with,
  // nor after an undo or a remove takes the last edge.
  it("says how to connect on the canvas until there's an edge, and again with none", async () => {
    const { projects } = renderOpenedProject({
      project: {
        ...sampleRecord.project,
        architecture: { ...sampleRecord.project.architecture, edges: [] },
      },
    });
    expect(connectLine()).not.toBeNull();

    select("Function (Lambda)");
    fireEvent.change(screen.getByRole("combobox", { name: "Connect to" }), {
      target: { value: "table" },
    });
    fireEvent.click(connectButton());
    await savedRecord(projects, (r) => edgeOf(r, "fn", "table") !== undefined);
    expect(connectLine()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Undo\b/ }));
    expect(connectLine()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Redo\b/ }));
    expect(connectLine()).toBeNull();
    select(FN_TO_TABLE);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const asking = screen.getByRole("group", { name: /^Remove the edge/ });
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));
    expect(connectLine()).not.toBeNull();
  });
});
