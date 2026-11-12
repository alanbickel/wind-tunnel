// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import type { Workload } from "../../domain/model/project";
import { RunControls } from "./RunControls";

interface Clicks {
  starts: number;
  stops: number;
}

/** Renders the controls and counts the clicks that get through. */
function renderControls(running: boolean): Clicks {
  const clicks = { starts: 0, stops: 0 };
  const { workloads } = sampleRecord.project;
  const [workload] = workloads;
  if (workload === undefined) throw new Error("sample has no workload");
  render(
    <RunControls
      workloads={workloads}
      workload={workload}
      onPick={() => undefined}
      onEdit={() => undefined}
      checks={new Map()}
      cantRunReasonId="reason"
      running={running}
      onStart={() => (clicks.starts += 1)}
      onStop={() => (clicks.stops += 1)}
    />,
  );
  return clicks;
}

function click(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("RunControls", () => {
  afterEach(cleanup);

  // Fails if the summary span is dropped from `WorkloadPicker`, or it keeps
  // describing the workload that was picked before.
  it("shows the picked workload's summary, and follows a new pick", () => {
    const { workloads } = sampleRecord.project;
    const [steady] = workloads;
    if (steady === undefined) throw new Error("sample has no workload");
    const spike: Workload = {
      ...steady,
      id: "spike",
      name: "Spike",
      durationMs: 20_000,
      profile: [{ atMs: 0, requestsPerSec: 2_000 }],
    };
    const props = {
      workloads: [steady, spike],
      onPick: () => undefined,
      onEdit: () => undefined,
      checks: new Map(),
      cantRunReasonId: "reason",
      running: false,
      onStart: () => undefined,
      onStop: () => undefined,
    };
    const { rerender } = render(<RunControls {...props} workload={steady} />);
    expect(screen.getByText("5 s · 20 req/s")).toBeTruthy();

    rerender(<RunControls {...props} workload={spike} />);

    expect(screen.getByText("20 s · 2k req/s")).toBeTruthy();
    expect(screen.queryByText("5 s · 20 req/s")).toBeNull();
  });

  it("ignores Run while running, and passes Stop on", () => {
    const clicks = renderControls(true);

    click("Run");
    click("Stop");

    expect(clicks).toEqual({ starts: 0, stops: 1 });
  });

  it("ignores Stop while idle, and passes Run on", () => {
    const clicks = renderControls(false);

    click("Stop");
    click("Run");

    expect(clicks).toEqual({ starts: 1, stops: 0 });
  });
});
