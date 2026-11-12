// @vitest-environment jsdom
// The workloads list for the templates' own workloads (#180). It sits
// outside the layers, as the composition root does, because it needs the
// templates (adapters) and the screen (ui), which may not import each other.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectA,
  projectB,
} from "../adapters/templates/testing/scenario-runs";
import { awsDescribeSelection } from "../application/testing/aws-describe-selection";
import { sampleRecord } from "../application/testing/sample-record";
import type { Project } from "../domain/model/project";
import { fakeUseCases } from "../ui/app/testing/fake-use-cases";
import { UseCasesProvider } from "../ui/app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../ui/diagram/testing/stub-diagram-browser-apis";
import { OpenedProject } from "../ui/project/OpenedProject";
import { TEST_SHELL, revealButton } from "../ui/project/testing/canvas-panels";
import { stubWindowWidth } from "../ui/shared/testing/stub-window-width";

/** The project on its screen, in a wide window. */
function renderProject(project: Project): void {
  stubWindowWidth("wide");
  const useCases = fakeUseCases({ describeSelection: awsDescribeSelection() });
  render(
    <UseCasesProvider useCases={useCases}>
      <OpenedProject
        record={{ ...sampleRecord, project, layout: { nodes: {} } }}
        shell={TEST_SHELL}
      />
    </UseCasesProvider>,
  );
}

describe("the workloads list for the templates", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a template's workloads are listed out of project order, by
  // another name, or with a problem count a sound template doesn't have.
  it.each([
    { name: "Template A", project: projectA },
    { name: "Template B", project: projectB },
  ])("lists $name's workloads in order, with no problems", ({ project }) => {
    renderProject(project);

    revealButton(project.workloads[0]?.name ?? "");
    const list = screen.getByRole("list", { name: "Workloads" });

    expect(
      within(list)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(project.workloads.map((workload) => workload.name));
  });
});
