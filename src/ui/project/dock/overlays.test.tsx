// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../../application/details/selection";
import type { RunSoFar } from "../../../application/run-analysis/run-so-far";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../../application/testing/sample-record";
import { sampleSnapshot } from "../../../application/testing/sample-snapshots";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import { UseCasesProvider } from "../../app/UseCasesProvider";
import type { RunMeaning } from "../../run/useRunFindings";
import type { ProjectRun } from "../../run/useProjectRun";
import type { ProjectSelection } from "../useSelection";
import type { OverlayProps } from "./overlay";
import { OVERLAY_KEYS, OVERLAYS } from "./overlays";
import { RunOverlay } from "./RunOverlay";
import { WorkloadOverlay } from "./WorkloadOverlay";

const { project } = sampleRecord;
const [steady] = project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

const EARLIER_VERSION =
  "This run is of an earlier version of the project. Run again to see your changes.";

/** What a run overlay reads of a run: whether it ran, its snapshots, whether it's current. */
interface RunShownInput {
  readonly run?: RunSoFar;
  readonly outOfDate?: boolean;
}

/**
 * A `ProjectRun` holding only what the overlays read: which workload ran,
 * the run so far, and whether it's out of date. Nothing else is drawn, so
 * the rest is left out.
 */
function projectRunOf({ run, outOfDate = false }: RunShownInput): ProjectRun {
  const meaning = run && ({ run } as RunMeaning);
  const ran = run && steady;
  return { ran, meaning, outOfDate } as ProjectRun;
}

/** A selection holding `selection`, whose calls do nothing. */
function selectingOf(selection: Selection | undefined): ProjectSelection {
  return {
    selection,
    selectWithin: vi.fn(),
    close: vi.fn(),
    takeFocus: () => false,
  } as Partial<ProjectSelection> as ProjectSelection;
}

function propsOf(
  selection: Selection | undefined,
  projectRun: ProjectRun = projectRunOf({}),
): OverlayProps {
  return {
    project,
    projectRun,
    selecting: selectingOf(selection),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
  };
}

const steadySelected: Selection = { kind: "workload", workloadId: "steady" };

describe("the dock's overlays", () => {
  afterEach(cleanup);

  // Fails if the tabs' order stops putting Run first.
  it("lists Run first, then the workload", () => {
    expect(OVERLAY_KEYS).toEqual(["run", "workload"]);
  });

  // Fails if Run's tab shows before a run starts, or the workload's shows
  // for another kind of selection or a workload the project no longer has.
  it("says which have something to show, by the run and the selection", () => {
    const run = { project, workloadId: "steady", snapshots: [] };
    expect(OVERLAYS.run.shows(propsOf(undefined))).toBe(false);
    expect(OVERLAYS.run.shows(propsOf(undefined, projectRunOf({ run })))).toBe(
      true,
    );
    expect(OVERLAYS.workload.shows(propsOf(steadySelected))).toBe(true);
    expect(
      OVERLAYS.workload.shows(
        propsOf({ kind: "component", componentId: "fn" }),
      ),
    ).toBe(false);
    expect(
      OVERLAYS.workload.shows(
        propsOf({ kind: "workload", workloadId: "gone" }),
      ),
    ).toBe(false);
  });

  // Fails if the workload's label isn't its name as the project has it now.
  it("labels the workload's tab with its name, read from the project", () => {
    const props = propsOf(steadySelected);
    const renamed = {
      ...project,
      workloads: [{ ...steady, name: "Dinner" }],
    };

    expect(OVERLAYS.workload.label(props)).toBe("Workload: Steady");
    expect(OVERLAYS.workload.label({ ...props, project: renamed })).toBe(
      "Workload: Dinner",
    );
  });
});

describe("RunOverlay", () => {
  afterEach(cleanup);

  // Fails if the overlay draws anything but the empty line before the
  // first snapshot.
  it("says nothing has run yet before the first snapshot", () => {
    render(<RunOverlay {...propsOf(undefined)} />);

    expect(screen.getByText("Nothing has run yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  // Fails if the overlay leaves out the totals or a chart, or draws the
  // verdict and findings, which are the inspector's.
  it("draws the run's totals, then its charts", () => {
    const snapshots = [sampleSnapshot({ second: 1, read: { started: 5 } })];
    const run = { project, workloadId: "steady", snapshots };

    render(<RunOverlay {...propsOf(undefined, projectRunOf({ run }))} />);

    const totals = screen.getByRole("table", { name: "Requests (run totals)" });
    const figures = screen.getAllByRole("figure");
    expect(figures).toHaveLength(4);
    expect(
      totals.compareDocumentPosition(figures[0] as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(EARLIER_VERSION)).toBeNull();
  });

  // Fails if a run of an earlier version of the project shows its tables
  // without saying so.
  it("opens with the out-of-date line when the run is of an earlier version", () => {
    const snapshots = [sampleSnapshot({ second: 1 })];
    const run = { project, workloadId: "steady", snapshots };

    render(
      <RunOverlay
        {...propsOf(undefined, projectRunOf({ run, outOfDate: true }))}
      />,
    );

    expect(screen.getByText(EARLIER_VERSION)).toBeTruthy();
  });
});

describe("WorkloadOverlay", () => {
  afterEach(cleanup);

  // Fails if the overlay doesn't draw the selected workload's editor, with
  // its heading and Close.
  it("draws the selected workload's editor", () => {
    render(
      <UseCasesProvider
        useCases={fakeUseCases({ describeSelection: awsDescribeSelection() })}
      >
        <WorkloadOverlay {...propsOf(steadySelected)} />
      </UseCasesProvider>,
    );

    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toBe("Steady · Workload");
    expect(screen.getByRole("textbox", { name: "Duration" })).toBeTruthy();
    expect(
      within(document.body).getByRole("button", { name: "Close" }),
    ).toBeTruthy();
  });

  // Fails if the overlay draws something for a selection that isn't a
  // workload.
  it("draws nothing for another kind of selection", () => {
    const { container } = render(
      <WorkloadOverlay
        {...propsOf({ kind: "component", componentId: "fn" })}
      />,
    );

    expect(container.childElementCount).toBe(0);
  });
});
