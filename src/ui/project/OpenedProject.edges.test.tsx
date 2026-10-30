// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Edge } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  cantRunRegion,
  renderOpenedProject,
  savedRecord,
} from "./testing/render-opened-project";

/** Selects a component or a connection from the diagram's text version. */
function select(name: string): void {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
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
  const heading = screen.getByRole("heading", { level: 4 });
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

describe("OpenedProject's edges", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if "Connect to…" offers the component itself or one it already
  // reaches, if choosing one doesn't save an edge with the caller type's
  // defaults, or if the connection isn't announced.
  it("connects a component from Connect to…, and saves the edge", async () => {
    const { projects } = renderOpenedProject();
    select("Function (lambda)");
    const picker = screen.getByRole("combobox", { name: "Connect to" });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["API (API Gateway)"]);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

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
    expect(screen.getByRole("button", { name: "Function → API" })).toBeTruthy();
  });

  // Fails if an edge's timeout field doesn't check its draft (0 would save
  // a project that can't open), or Reset doesn't put back the caller
  // type's default: 5,000 ms from a Lambda.
  it("holds a timeout of 0 with its message, and resets to the caller type's default", async () => {
    const { projects } = renderOpenedProject();
    select(FN_TO_TABLE);
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

    fireEvent.click(
      screen.getByRole("button", { name: "Reset to default: Timeout" }),
    );
    const saved = await savedRecord(
      projects,
      (r) => edgeOf(r, "fn", "table")?.timeoutMs === 5_000,
    );
    expect(edgeOf(saved, "fn", "table")?.latencyMs).toBe(2);
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
});
