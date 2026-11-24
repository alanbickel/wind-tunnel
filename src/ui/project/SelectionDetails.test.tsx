// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../application/details/selection";
import { awsDescribeSelection } from "../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { SelectionDetails } from "./SelectionDetails";

/** Details for the selection, in the sample project, and its spies. */
function renderDetails(selection: Selection) {
  const useCases = fakeUseCases({ describeSelection: awsDescribeSelection() });
  const onEdit = vi.fn();
  const onSelect = vi.fn();
  const after = vi.fn();
  render(
    <UseCasesProvider useCases={useCases}>
      <SelectionDetails
        project={sampleRecord.project}
        selection={selection}
        onEdit={onEdit}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onSelect={onSelect}
        stepRows={{ buttons: () => () => undefined, after }}
        takeFocus={() => false}
      />
    </UseCasesProvider>,
  );
  return { onEdit, onSelect, after };
}

const step = (stepId: string): Selection => ({
  kind: "step",
  workflowId: "read",
  stepId,
});

describe("SelectionDetails", () => {
  afterEach(cleanup);

  // Fails if a selected step shows its workflow (its outline or name
  // field) instead of itself, leaves out how a request reaches it along
  // which edge, or a step its workflow doesn't have shows anything but
  // "Nothing selected".
  it("shows a selected step on its own, and nothing for a step its workflow doesn't have", () => {
    renderDetails(step("table-read"));
    expect(screen.getByRole("heading").textContent).toBe(
      "Table · read · Step 1.1.1 of Read item",
    );
    expect(
      screen.getByText("Called by Function · invoke, along Function → Table."),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Steps" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    cleanup();

    renderDetails(step("gone"));
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(/^Nothing selected\./)).toBeTruthy();
  });

  // Fails if the first step offers a Remove, which would be the
  // workflow's, or doesn't say that each request starts there.
  it("gives the first step no Remove, and says requests start there", () => {
    renderDetails(step("api-invoke"));

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(
      screen.getByText(
        "The first step: each request of Read item starts here.",
      ),
    ).toBeTruthy();
  });

  // Fails if a step's Remove asks first when nothing is under it, doesn't
  // save, doesn't select its caller, or doesn't send the focus to the
  // caller's line in the outline.
  it("removes a step with nothing under it at once, selecting its caller and focusing its line", () => {
    const { onEdit, onSelect, after } = renderDetails(step("table-read"));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("group", { name: /^Remove / })).toBeNull();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(step("fn-invoke"), "none");
    expect(after).toHaveBeenCalledWith("fn-invoke");
  });

  // Fails if a step with calls under it goes without asking, or its
  // question's Remove doesn't remove it.
  it("asks before removing a step with calls under it", () => {
    const { onEdit, after } = renderDetails(step("fn-invoke"));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onEdit).not.toHaveBeenCalled();
    const asking = screen.getByRole("group", { name: /^Remove / });
    fireEvent.click(within(asking).getByRole("button", { name: "Remove" }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledWith("api-invoke");
  });

  // Fails if a selected workflow shows its outline, which is the dock's
  // now, or leaves out its name field or the workloads that run it with
  // their shares.
  it("shows a workflow's name and the workloads that run it, and no outline", () => {
    renderDetails({ kind: "workflow", workflowId: "read" });

    expect(screen.getByRole("heading").textContent).toBe(
      "Read item · Workflow",
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("Used by: Steady (100.0%)")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Steps" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });
});
