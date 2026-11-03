import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import {
  awsNewComponent,
  awsNewEdge,
} from "../../../application/testing/aws-component-types";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { awsSaveProject } from "../../../application/testing/aws-save-project";
import { InMemoryProjectRepository } from "../../../application/testing/in-memory-project-repository";
import { sampleRecord } from "../../../application/testing/sample-record";
import { awsRunSimulation } from "../../../application/testing/aws-run-simulation";
import type { ProjectRecord } from "../../../application/ports/project-record";
import type { Project } from "../../../domain/model/project";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import type { UseCases } from "../../app/use-cases";
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
  /** The real one over the AWS types, saving to `projects`, unless given. */
  readonly saveProject?: UseCases["saveProject"];
  /** The real one over the AWS types, driven by `runner`, unless given. */
  readonly runSimulation?: UseCases["runSimulation"];
}

/** An opened project on screen, and what drives it. */
export interface RenderedProject extends RenderResult {
  /** Sends the run's snapshots and ends it. */
  readonly runner: ManualSimulationRunner;
  /** Crosses the window's width breakpoint. */
  readonly resize: ResizeWindow;
  /** Hands the open screen a changed project, as opening it again would. */
  readonly change: (project: Project) => void;
  /** Where the default `saveProject` saves. */
  readonly projects: InMemoryProjectRepository;
}

/**
 * Renders `OpenedProject` with the sample record, runs driven by the test,
 * the AWS wording for selections, new components with ids `new-1`, `new-2`,
 * …, and saves to memory.
 */
export function renderOpenedProject({
  project = sampleRecord.project,
  width = "wide",
  saveProject,
  runSimulation,
}: RenderOpenedProjectInput = {}): RenderedProject {
  const resize = stubWindowWidth(width);
  const runner = new ManualSimulationRunner();
  const projects = new InMemoryProjectRepository();
  const useCases = fakeUseCases({
    runSimulation: runSimulation ?? awsRunSimulation(runner),
    describeSelection: awsDescribeSelection(),
    newComponent: awsNewComponent(),
    newEdge: awsNewEdge(),
    saveProject: saveProject ?? awsSaveProject(projects),
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
  return { runner, resize, change, projects, ...view };
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

/**
 * The bar's region that says why the picked workload can't run, after the
 * run's status and whether it's out of date.
 */
export function cantRunRegion(): HTMLElement {
  const region = within(bar()).getAllByRole("status")[2];
  if (region === undefined) throw new Error("the bar should say why");
  return region;
}

/** The run's status line. */
export function status(): string | null {
  return statusRegions()[0].textContent;
}

export function clickRun(): void {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
}

/** The record saved for the sample, once a save matching `check` lands. */
export async function savedRecord(
  projects: InMemoryProjectRepository,
  check: (record: ProjectRecord) => boolean,
): Promise<ProjectRecord> {
  let saved: ProjectRecord | undefined;
  await waitFor(async () => {
    const lookup = await projects.get(sampleRecord.project.id);
    if (lookup.status !== "found" || !check(lookup.record)) {
      throw new Error("not saved yet");
    }
    saved = lookup.record;
  });
  if (saved === undefined) throw new Error("not saved");
  return saved;
}
