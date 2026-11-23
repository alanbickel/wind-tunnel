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
  /**
   * Use cases that replace the defaults, applied last: those over other
   * component types than AWS's, for a project that uses them.
   */
  readonly useCases?: Partial<UseCases>;
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
    ...input.useCases,
  });
}

/**
 * The Details heading, the selected item's name and what kind it is: in
 * the inspector's Details, wide or narrow. Null while nothing is selected.
 */
export function queryDetailsHeading(): HTMLElement | null {
  const details = screen.queryByRole("region", { name: "Details" });
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

/**
 * The Workflows tab's polite region, beside the open workflow's outline,
 * which says what a step's edit there did. The tab must be showing.
 */
export function outlineStatus(): HTMLElement {
  const outline = within(dockPanel("Workflows")).getByRole("region");
  return within(outline).getByRole("status");
}

/** A wide window's inspector, the column beside the canvas and the dock. */
export function inspector(): HTMLElement {
  return screen.getByRole("region", { name: "Inspector" });
}

/**
 * The project's overview, which the inspector shows, wide or narrow, while
 * nothing is selected: a region named "Overview". It must be there.
 */
export function overview(): HTMLElement {
  return screen.getByRole("region", { name: "Overview" });
}

/**
 * The run's explanation, which the inspector shows, wide or narrow, while
 * the run or one of its findings is selected: a region named by its
 * heading, "Run: <workload>". Null while it isn't shown.
 */
export function queryRunExplanation(): HTMLElement | null {
  return screen.queryByRole("region", { name: /^Run: / });
}

/** The run's explanation, which must be there. */
export function runExplanation(): HTMLElement {
  const found = queryRunExplanation();
  if (found === null) throw new Error("the run's explanation should show");
  return found;
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

/**
 * The run group's status regions: the run's status, then whether it's out
 * of date. The top bar says nothing about the run.
 */
export function statusRegions(): [HTMLElement, HTMLElement] {
  const [runStatus, outOfDate] = within(runGroup()).getAllByRole("status");
  if (runStatus === undefined || outOfDate === undefined) {
    throw new Error("the run group should have two status regions");
  }
  return [runStatus, outOfDate];
}

/**
 * The run group: the workload Run runs, Run and Stop, and the verdict, at
 * the end of the dock's tab strip in a wide window, or in the top bar in
 * a narrow one. There's one of it.
 */
export function runGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Run" });
}

/**
 * The run group's region that says why the picked workload can't run,
 * after the run's two.
 */
export function cantRunRegion(): HTMLElement {
  const region = within(runGroup()).getAllByRole("status")[2];
  if (region === undefined) throw new Error("the run group should say why");
  return region;
}

/**
 * The bar's region that says what Undo or Redo did, beside Undo and Redo,
 * before the narrow window's run group.
 */
export function undoneRegion(): HTMLElement {
  const region = within(bar()).getAllByRole("status")[0];
  if (region === undefined) throw new Error("the bar should say what Undo did");
  return region;
}

/**
 * The banner's region that says the last change didn't save: the first
 * strip under the top bar, before the storage hint.
 */
export function saveFailureRegion(): HTMLElement {
  const strip = bar().nextElementSibling;
  const region = strip?.querySelector<HTMLElement>(':scope > [role="status"]');
  if (region == null) throw new Error("the banner should say a save failed");
  return region;
}

/** The run's status, in the run group. */
export function status(): string | null {
  return statusRegions()[0].textContent;
}

/** Presses Run, in the run group. */
export function clickRun(): void {
  fireEvent.click(within(runGroup()).getByRole("button", { name: "Run" }));
}

/**
 * The run group's verdict, which selects the run: a button named by its
 * verdict ("Healthy", "Failing · 43.7%"), wherever the group is.
 */
export function groupVerdict(): HTMLElement {
  const buttons = within(runGroup()).getAllByRole("button");
  const verdict = buttons.find((b) => b.hasAttribute("data-level"));
  if (verdict === undefined) throw new Error("the group should have a verdict");
  return verdict;
}

/** Selects the run again from the run group's verdict. */
export function selectTheRun(): void {
  fireEvent.click(groupVerdict());
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
