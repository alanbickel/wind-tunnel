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
import type { ProjectRecord } from "../../../application/ports/project-record";
import type { ComponentStatus } from "../../../application/run-analysis/component-status";
import { sampleRecord } from "../../../application/testing/sample-record";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import { UseCasesProvider } from "../../app/UseCasesProvider";
import type { RunBadges } from "../../run/run-badges";
import type { ProjectRun } from "../../run/useProjectRun";
import type { ProjectSelection } from "../useSelection";
import { ComponentsOverlay } from "./ComponentsOverlay";
import { focusInDock } from "./focus-in-dock";
import type { OverlayProps } from "./overlay";

/** What a test sets of what the tab reads. */
interface TabInput {
  readonly selection?: Selection;
  readonly badges?: RunBadges;
  readonly record?: ProjectRecord;
}

/** The tab, with a spy for what its rows select. */
function renderTab({
  selection,
  badges,
  record = sampleRecord,
}: TabInput = {}) {
  const select = vi.fn<(selection: Selection) => void>();
  const selecting = { selection, select } as Partial<ProjectSelection>;
  const props: OverlayProps = {
    record,
    project: record.project,
    projectRun: { badges } as ProjectRun,
    selecting: selecting as ProjectSelection,
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    listRef: { current: null },
    addingWorkload: { onAdd: vi.fn(), buttonRef: { current: null } },
    announcement: "",
  };
  render(
    <UseCasesProvider useCases={fakeUseCases()}>
      <ComponentsOverlay {...props} />
    </UseCasesProvider>,
  );
  return { select };
}

function itemsOf(listName: string): (string | null)[] {
  const list = screen.getByRole("list", { name: listName });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("ComponentsOverlay", () => {
  afterEach(cleanup);

  // Fails if the tab leaves out a component or a connection, or lists them
  // other than by name and type, "from → to", in project order.
  it("lists the components and connections", () => {
    renderTab();

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway)",
      "Function (Lambda)",
      "Table (DynamoDB)",
    ]);
    expect(itemsOf("Connections")).toEqual([
      "API → Function",
      "Function → Table",
    ]);
  });

  // Fails if the tab doesn't number a selected workflow's connections as the
  // canvas does (each call in order), or numbers any with no workflow
  // selected.
  it("numbers the connections while a workflow is selected", () => {
    renderTab({ selection: { kind: "workflow", workflowId: "read" } });
    expect(itemsOf("Connections")).toEqual([
      "API → Function (call 1)",
      "Function → Table (call 2)",
    ]);
    cleanup();

    renderTab();
    expect(itemsOf("Connections")).toEqual([
      "API → Function",
      "Function → Table",
    ]);
  });

  // Fails if the tab says "call" for an arrow that several calls follow, or
  // lists only one of its numbers.
  it("lists every number of a connection several calls follow, as calls", () => {
    const twice: ProjectRecord = {
      ...sampleRecord,
      project: {
        ...sampleRecord.project,
        workflows: sampleRecord.project.workflows.map((workflow) => ({
          ...workflow,
          root: {
            ...workflow.root,
            calls: [
              {
                id: "fn-invoke",
                componentId: "fn",
                action: "invoke",
                calls: [
                  { id: "table-read", componentId: "table", action: "read" },
                  { id: "table-again", componentId: "table", action: "read" },
                ],
              },
            ],
          },
        })),
      },
    };

    renderTab({
      record: twice,
      selection: { kind: "workflow", workflowId: "read" },
    });

    expect(itemsOf("Connections")).toEqual([
      "API → Function (call 1)",
      "Function → Table (calls 2, 3)",
    ]);
  });

  // Fails if the tab drops the status after a name, leaves it off a
  // component the run has no entry for, or loses the note when the run is
  // out of date.
  it("lists each component's status, with a note when the run is out of date", () => {
    const statuses = new Map<string, ComponentStatus>([
      ["api", "ok"],
      ["fn", "waited"],
    ]);
    renderTab({ badges: { statuses, outOfDate: false } });

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway): ok",
      "Function (Lambda): waited",
      "Table (DynamoDB)",
    ]);
    cleanup();

    renderTab({ badges: { statuses, outOfDate: true } });

    expect(itemsOf("Components")).toEqual([
      "API (API Gateway): ok, from an earlier version of the project",
      "Function (Lambda): waited, from an earlier version of the project",
      "Table (DynamoDB)",
    ]);
  });

  // Fails if a row selects the wrong kind of item or the wrong one, or the
  // list doesn't mark the selection as current.
  it("selects what a row names, and marks the selection", () => {
    const { select } = renderTab({
      selection: { kind: "edge", edgeId: "api-fn" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Table (DynamoDB)" }));
    fireEvent.click(screen.getByRole("button", { name: "Function → Table" }));

    expect(select.mock.calls).toEqual([
      [{ kind: "component", componentId: "table" }],
      [{ kind: "edge", edgeId: "fn-table" }],
    ]);
    const current = screen.getAllByRole("button", { current: true });
    expect(current.map((button) => button.textContent)).toEqual([
      "API → Function",
    ]);
  });

  // Fails if a project with no components gets empty lists, which a screen
  // reader announces as lists of zero items, or no line saying what to do.
  it("says there are no components, and points to adding one", () => {
    renderTab({
      record: {
        ...sampleRecord,
        project: {
          ...sampleRecord.project,
          architecture: { components: [], edges: [] },
          workflows: [],
        },
      },
    });

    expect(screen.getByText(/No components yet\. Add one/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("group", { name: "Components and connections" }));
  });
});

/** A dock's parts as `Tabs` draws them: a tab, its panel, and a fold button. */
function renderDockParts(hidden: { tab: boolean; panel: boolean }) {
  render(
    <div>
      <div hidden={hidden.tab}>
        <button id="tab" role="tab" type="button">
          Components
        </button>
      </div>
      <button aria-controls="panels" type="button">
        Unfold
      </button>
      <div id="panels">
        <div role="tabpanel" aria-labelledby="tab" hidden={hidden.panel}>
          <div id="list" tabIndex={-1} />
        </div>
      </div>
    </div>,
  );
  return document.getElementById("list");
}

describe("focusInDock", () => {
  afterEach(cleanup);

  // Fails if a remove with the Components tab showing doesn't put the
  // focus on its list.
  it("focuses the list while it shows", () => {
    focusInDock(renderDockParts({ tab: false, panel: false }));

    expect(document.activeElement?.id).toBe("list");
  });

  // Fails if the focus goes to a hidden list (and is lost), or the tab is
  // changed, instead of the Components tab taking it.
  it("focuses the Components tab when another tab shows", () => {
    focusInDock(renderDockParts({ tab: false, panel: true }));

    expect(document.activeElement?.id).toBe("tab");
  });

  // Fails if a folded dock, whose tabs are hidden, loses the focus instead
  // of Unfold taking it.
  it("focuses Unfold when the dock is folded", () => {
    focusInDock(renderDockParts({ tab: true, panel: true }));

    expect(document.activeElement?.textContent).toBe("Unfold");
  });
});
