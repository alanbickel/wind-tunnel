// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../../application/details/selection";
import { awsDescribeSelection } from "../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { SelectionDetails } from "./SelectionDetails";

/** Details for the selection, in the sample project. */
function renderDetails(selection: Selection): void {
  const useCases = fakeUseCases({ describeSelection: awsDescribeSelection() });
  render(
    <UseCasesProvider useCases={useCases}>
      <SelectionDetails
        project={sampleRecord.project}
        selection={selection}
        onEdit={vi.fn()}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        takeFocus={() => false}
      />
    </UseCasesProvider>,
  );
}

describe("SelectionDetails", () => {
  afterEach(cleanup);

  // Fails if a step its workflow doesn't have shows the workflow, with
  // nothing marked, instead of "Nothing selected"; or a step it has stops
  // showing the workflow's outline.
  it("shows a selected step's workflow, and nothing for a step it doesn't have", () => {
    renderDetails({ kind: "step", workflowId: "read", stepId: "fn-invoke" });
    expect(screen.getByRole("heading").textContent).toBe(
      "Read item · Workflow",
    );
    cleanup();

    renderDetails({ kind: "step", workflowId: "read", stepId: "gone" });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(/^Nothing selected\./)).toBeTruthy();
  });
});
