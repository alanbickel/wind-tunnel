import {
  fireEvent,
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { sampleRecord } from "../../../application/testing/sample-record";
import { RunSimulation } from "../../../application/use-cases/run-simulation";
import type { Project } from "../../../domain/model/project";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import { UseCasesProvider } from "../../app/UseCasesProvider";
import { ManualSimulationRunner } from "../../run/testing/manual-simulation-runner";
import {
  stubWindowWidth,
  type ResizeWindow,
  type WindowWidth,
} from "../../shared/testing/stub-window-width";
import { OpenedProject } from "../OpenedProject";

export interface RenderOpenedProjectInput {
  /** The sample record's project, unless given. */
  readonly project?: Project;
  /** Wide, unless given. */
  readonly width?: WindowWidth;
}

/** An opened project on screen, and what drives it. */
export interface RenderedProject extends RenderResult {
  /** Sends the run's snapshots and ends it. */
  readonly runner: ManualSimulationRunner;
  /** Crosses the window's width breakpoint. */
  readonly resize: ResizeWindow;
  /** Hands the open screen a changed project, as an edit will. */
  readonly change: (project: Project) => void;
}

/**
 * Renders `OpenedProject` with the sample record, runs driven by the test,
 * and the AWS wording for selections.
 */
export function renderOpenedProject({
  project = sampleRecord.project,
  width = "wide",
}: RenderOpenedProjectInput = {}): RenderedProject {
  const resize = stubWindowWidth(width);
  const runner = new ManualSimulationRunner();
  const useCases = fakeUseCases({
    runSimulation: new RunSimulation({ runner }),
    describeSelection: awsDescribeSelection(),
  });
  const screenOf = (shown: Project) => (
    <UseCasesProvider useCases={useCases}>
      <OpenedProject record={{ ...sampleRecord, project: shown }} />
    </UseCasesProvider>
  );
  const view = render(screenOf(project));
  const change = (changed: Project) => {
    view.rerender(screenOf(changed));
  };
  return { runner, resize, change, ...view };
}

/** The project bar, named by the sample project. */
export function bar(): HTMLElement {
  return screen.getByRole("region", { name: "Sample project" });
}

/** The bar's status regions: the run's status, then whether it's out of date. */
export function statusRegions(): [HTMLElement, HTMLElement] {
  const [runStatus, outOfDate] = within(bar()).getAllByRole("status");
  if (runStatus === undefined || outOfDate === undefined) {
    throw new Error("the bar should have two status regions");
  }
  return [runStatus, outOfDate];
}

/** The run's status line. */
export function status(): string | null {
  return statusRegions()[0].textContent;
}

export function clickRun(): void {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
}
