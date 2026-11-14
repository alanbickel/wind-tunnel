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
  awsChangeStep,
  awsNewCall,
  awsNewWorkflow,
  newWorkload,
} from "../../../application/testing/aws-component-types";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import { awsSaveProject } from "../../../application/testing/aws-save-project";
import { InMemoryProjectRepository } from "../../../application/testing/in-memory-project-repository";
import { sampleRecord } from "../../../application/testing/sample-record";
import { awsRunSimulation } from "../../../application/testing/aws-run-simulation";
import type {
  Layout,
  ProjectRecord,
} from "../../../application/ports/project-record";
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
import { TEST_SHELL } from "./canvas-panels";

export interface RenderOpenedProjectInput {
  /** The sample record's project, unless given. */
  readonly project?: Project;
  /** The sample record's layout, unless given, as a project saved with moves would have. */
  readonly layout?: Layout;
  /** Wide, unless given. */
  readonly width?: WindowWidth;
  /** Where projects are saved and listed, unless given. */
  readonly projects?: InMemoryProjectRepository;
  /** The real one over the AWS types, saving to `projects`, unless given. */
  readonly saveProject?: UseCases["saveProject"];
  /** The real one over the AWS types, driven by `runner`, unless given. */
  readonly runSimulation?: UseCases["runSimulation"];
  /** Reads from `projects` in memory unless given. */
  readonly listProjects?: UseCases["listProjects"];
  /** Follows the saved record's name. */
  readonly onProjectNameChange?: (name: string) => void;
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
 * …, new workflows with ids `wf-1`, `wf-2`, …, and saves to memory.
 */
export function renderOpenedProject(
  input: RenderOpenedProjectInput = {},
): RenderedProject {
  const {
    project = sampleRecord.project,
    layout = sampleRecord.layout,
    width = "wide",
    projects: givenProjects,
    onProjectNameChange,
  } = input;
  const resize = stubWindowWidth(width);
  const runner = new ManualSimulationRunner();
  const projects = givenProjects ?? new InMemoryProjectRepository();
  const useCases = buildUseCases({ input, runner, projects });
  const screenOf = (shown: Project) => (
    <UseCasesProvider useCases={useCases}>
      <OpenedProject
        record={{ ...sampleRecord, project: shown, layout }}
        shell={TEST_SHELL}
        onProjectNameChange={onProjectNameChange}
      />
    </UseCasesProvider>
  );
  const view = render(screenOf(project));
  const change = (changed: Project) => {
    view.rerender(screenOf(changed));
  };
  return { runner, resize, change, projects, ...view };
}

interface BuildUseCasesInput {
  readonly input: RenderOpenedProjectInput;
  readonly runner: ManualSimulationRunner;
  readonly projects: InMemoryProjectRepository;
}

function buildUseCases({
  input,
  runner,
  projects,
}: BuildUseCasesInput): UseCases {
  return fakeUseCases({
    listProjects: input.listProjects ?? { execute: () => projects.list() },
    runSimulation: input.runSimulation ?? awsRunSimulation(runner),
    describeSelection: awsDescribeSelection(),
    newComponent: awsNewComponent(),
    newCall: awsNewCall(),
    changeStep: awsChangeStep(),
    newEdge: awsNewEdge(),
    newWorkflow: awsNewWorkflow(),
    newWorkload: newWorkload(),
    saveProject: input.saveProject ?? awsSaveProject(projects),
  });
}

/**
 * The Details heading, the selected item's name and what kind it is: in
 * the Details tab of a wide window, or the Details panel of a narrow one.
 * Null while Details shows nothing.
 */
export function queryDetailsHeading(): HTMLElement | null {
  const details =
    screen.queryByRole("tabpanel", { name: "Details" }) ??
    screen.queryByRole("region", { name: "Details" }) ??
    queryDock();
  return details && within(details).queryByRole("heading", { level: 4 });
}

/** The dock under the canvas; null while it has nothing to show. */
export function queryDock(): HTMLElement | null {
  return screen.queryByRole("region", { name: "Dock" });
}

/** The dock, which must be there. */
export function dock(): HTMLElement {
  const found = queryDock();
  if (found === null) throw new Error("the dock should be there");
  return found;
}

/**
 * The dock's tabs' labels, in order. The tab list is named apart from the
 * dock's region, so a screen reader doesn't hear "Dock" twice.
 */
export function dockTabs(): (string | null)[] {
  const tabList = within(dock()).getByRole("tablist", {
    name: "Dock overlays",
  });
  return within(tabList)
    .getAllByRole("tab")
    .map((tab) => tab.textContent);
}

/** The dock's shown overlay: its panel, named by its tab's label. */
export function dockPanel(label: string | RegExp): HTMLElement {
  return within(dock()).getByRole("tabpanel", { name: label });
}

/** A wide window's inspector, which floats over the canvas. */
export function inspector(): HTMLElement {
  return screen.getByRole("region", { name: "Inspector" });
}

/** The Details heading, which must be there. */
export function detailsHeading(): HTMLElement {
  const heading = queryDetailsHeading();
  if (heading === null) throw new Error("Details should have a heading");
  return heading;
}

/** The top bar, which holds the project's name and controls. */
export function bar(): HTMLElement {
  return screen.getByRole("banner");
}

/** The bar's status regions: the run's status, then whether it's out of date. */
export function statusRegions(): [HTMLElement, HTMLElement] {
  const [, runStatus, outOfDate] = within(bar()).getAllByRole("status");
  if (runStatus === undefined || outOfDate === undefined) {
    throw new Error("the bar should have two status regions");
  }
  return [runStatus, outOfDate];
}

/**
 * The bar's region that says why the picked workload can't run, after
 * what Undo did, the run's status, and whether it's out of date.
 */
export function cantRunRegion(): HTMLElement {
  const region = within(bar()).getAllByRole("status")[3];
  if (region === undefined) throw new Error("the bar should say why");
  return region;
}

/**
 * The bar's region that says what Undo or Redo did, under the project's
 * name, before the run's regions.
 */
export function undoneRegion(): HTMLElement {
  const region = within(bar()).getAllByRole("status")[0];
  if (region === undefined) throw new Error("the bar should say what Undo did");
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
