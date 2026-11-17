// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../../application/details/selection";
import type { RunSoFar } from "../../../application/run-analysis/run-so-far";
import { sampleRecord } from "../../../application/testing/sample-record";
import { sampleSnapshot } from "../../../application/testing/sample-snapshots";
import type { RunMeaning } from "../../run/useRunFindings";
import type { ProjectRun } from "../../run/useProjectRun";
import type { ProjectSelection } from "../useSelection";
import type { OverlayProps } from "./overlay";
import { OVERLAY_KEYS, OVERLAYS } from "./overlays";
import { RunOverlay } from "./RunOverlay";

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
    record: sampleRecord,
    project,
    projectRun,
    selecting: selectingOf(selection),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    listRef: { current: null },
    addingWorkflow: { onAdd: vi.fn(), buttonRef: { current: null } },
    addingWorkload: { onAdd: vi.fn(), buttonRef: { current: null } },
    stepRows: { buttons: () => () => undefined, after: vi.fn() },
    announcement: "",
  };
}

const steadySelected: Selection = { kind: "workload", workloadId: "steady" };

describe("the dock's overlays", () => {
  afterEach(cleanup);

  // Fails if the tabs' order stops being the modeling loop's: Library,
  // Components, Workflows, Workloads, then Run.
  it("lists Library first, then Components, Workflows, Workloads, and Run", () => {
    expect(OVERLAY_KEYS).toEqual([
      "library",
      "components",
      "workflows",
      "workloads",
      "run",
    ]);
  });

  // Fails if the tab's label isn't its name, or depends on the selection.
  it.each([
    ["library", "Library"],
    ["components", "Components"],
    ["workflows", "Workflows"],
    ["workloads", "Workloads"],
    ["run", "Run"],
  ] as const)("labels the %s tab %s", (key, label) => {
    expect(OVERLAYS[key].label(propsOf(undefined))).toBe(label);
    expect(OVERLAYS[key].label(propsOf(steadySelected))).toBe(label);
  });

  // Fails if one of the always-there tabs is left out for want of a run, a
  // selection, components, workflows, or workloads, so there'd be no place
  // to add the first one.
  it.each(["library", "components", "workflows", "workloads"] as const)(
    "always shows the %s tab",
    (key) => {
      const run = { project, workloadId: "steady", snapshots: [] };
      const empty = {
        ...project,
        architecture: { components: [], edges: [] },
        workflows: [],
        workloads: [],
      };
      const { shows } = OVERLAYS[key];
      expect(shows(propsOf(undefined))).toBe(true);
      expect(shows(propsOf(steadySelected))).toBe(true);
      expect(shows(propsOf(undefined, projectRunOf({ run })))).toBe(true);
      expect(shows({ ...propsOf(undefined), project: empty })).toBe(true);
    },
  );

  // Fails if Run's tab shows before a run starts, or not once one has.
  it("shows the Run tab once a run has started", () => {
    const run = { project, workloadId: "steady", snapshots: [] };
    expect(OVERLAYS.run.shows(propsOf(undefined))).toBe(false);
    expect(OVERLAYS.run.shows(propsOf(undefined, projectRunOf({ run })))).toBe(
      true,
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
