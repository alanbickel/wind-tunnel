// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
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
