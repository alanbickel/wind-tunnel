// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../../application/details/selection";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../../application/testing/sample-record";
import type { Project } from "../../../domain/model/project";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import { UseCasesProvider } from "../../app/UseCasesProvider";
import type { ProjectSelection } from "../useSelection";
import type { OverlayProps } from "./overlay";
import { WorkloadsOverlay } from "./WorkloadsOverlay";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("The sample has a workload");

/** The sample with a second workload, "Lunch rush", as long as "Steady". */
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "lunch", name: "Lunch rush" }],
};

const STEADY: Selection = { kind: "workload", workloadId: "steady" };
const A_COMPONENT: Selection = { kind: "component", componentId: "fn" };
const WHAT_A_WORKLOAD_IS =
  "A workload says how much traffic your workflows get, and for how long. Select one to edit it.";

/** What the tab shows: the project, the selection, and the open workload. */
interface TabInput {
  readonly project?: Project;
  readonly selection?: Selection;
  readonly openWorkloadId?: string;
}

/** The tab's props, with spies for what it selects and adds. */
function propsOf(input: TabInput): OverlayProps {
  const selecting = {
    selection: input.selection,
    openWorkloadId: input.openWorkloadId,
    select: vi.fn(),
  } as Partial<ProjectSelection> as ProjectSelection;
  const addingWorkload = { onAdd: vi.fn(), buttonRef: { current: null } };
  return {
    project: input.project ?? sampleRecord.project,
    selecting,
    onEdit: vi.fn(),
    addingWorkload,
  } as Partial<OverlayProps> as OverlayProps;
}

/** The tab drawn from `props`, and how to draw it again with others. */
function renderTab(props: OverlayProps) {
  const useCases = fakeUseCases({ describeSelection: awsDescribeSelection() });
  const tab = (shown: OverlayProps) => (
    <UseCasesProvider useCases={useCases}>
      <WorkloadsOverlay {...shown} />
    </UseCasesProvider>
  );
  const { rerender } = render(tab(props));
  return (next: OverlayProps) => {
    rerender(tab(next));
  };
}

/** The open workload's editor: a region named by its workload's name. */
function editor(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

function duration(name: string): HTMLInputElement {
  return within(editor(name)).getByRole<HTMLInputElement>("textbox", {
    name: "Duration",
  });
}

describe("WorkloadsOverlay", () => {
  afterEach(cleanup);

  // Fails if the tab leaves out the list, its "Add workload", or a row,
  // or with none open shows an editor instead of what a workload is.
  it("lists the workloads, with Add workload, and says what one is while none is open", () => {
    renderTab(propsOf({ project: twoWorkloads }));

    const list = screen.getByRole("list", { name: "Workloads" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(["Steady", "Lunch rush"]);
    expect(screen.getByRole("button", { name: "Add workload" })).toBeTruthy();
    expect(screen.getByText(WHAT_A_WORKLOAD_IS)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Fails if the editor leaves out the open workload's heading or values,
  // or holds the name, problems, or Remove, which are the inspector's, or
  // a Close, which the tab no longer has.
  it("shows the open workload's editor beside the list", () => {
    renderTab(propsOf({ selection: STEADY, openWorkloadId: "steady" }));

    const open = editor("Steady");
    expect(within(open).getByRole("heading", { level: 4 }).textContent).toBe(
      "Steady",
    );
    expect(duration("Steady").value).toBe(String(steady.durationMs / 1000));
    expect(within(open).queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(within(open).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByText(WHAT_A_WORKLOAD_IS)).toBeNull();
  });

  // Fails if the editor follows the selection rather than the tab's open
  // workload, so selecting a box closes it (rule 3), or its row stays
  // marked as the selection once something else is selected.
  it("keeps the open workload's editor while a component is selected", () => {
    renderTab(propsOf({ selection: A_COMPONENT, openWorkloadId: "steady" }));

    expect(duration("Steady")).toBeTruthy();
    const row = screen.getByRole("button", { name: "Steady" });
    expect(row.getAttribute("aria-current")).toBeNull();
  });

  // Fails if the tab shows an editor, or nothing, for an open workload the
  // project no longer has, as after its remove or an undo of its add.
  it("says what a workload is once the open one has gone", () => {
    renderTab(
      propsOf({ project: twoWorkloads, openWorkloadId: "removed-since" }),
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(WHAT_A_WORKLOAD_IS)).toBeTruthy();
  });

  // Fails if a project with no workloads says what one is twice, or shows
  // no line at all.
  it("says what a workload is once, in the list, while there are none", () => {
    const none = { ...sampleRecord.project, workloads: [] };
    renderTab(propsOf({ project: none }));

    expect(screen.getByText(/^No workloads yet\./)).toBeTruthy();
    expect(screen.queryByText(WHAT_A_WORKLOAD_IS)).toBeNull();
  });

  // Fails if a row doesn't select its workload, or "Add workload" doesn't
  // add one.
  it("selects a workload from its row, and adds one from Add workload", () => {
    const props = propsOf({ project: twoWorkloads });
    renderTab(props);

    fireEvent.click(screen.getByRole("button", { name: "Lunch rush" }));
    fireEvent.click(screen.getByRole("button", { name: "Add workload" }));

    expect(props.selecting.select).toHaveBeenCalledWith({
      kind: "workload",
      workloadId: "lunch",
    });
    expect(props.addingWorkload.onAdd).toHaveBeenCalledTimes(1);
  });

  // Fails if the editor isn't keyed by its workload, so a draft typed in
  // one shows in the next one opened. The two have the same duration, so
  // the field's saved value doesn't change to put the draft back.
  it("never shows one workload's draft in another's editor", () => {
    const rerender = renderTab(
      propsOf({ project: twoWorkloads, openWorkloadId: "steady" }),
    );
    fireEvent.change(duration("Steady"), { target: { value: "999" } });

    rerender(propsOf({ project: twoWorkloads, openWorkloadId: "lunch" }));

    expect(duration("Lunch rush").value).toBe(String(steady.durationMs / 1000));
  });
});
