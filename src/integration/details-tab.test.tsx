// @vitest-environment jsdom
// The Details tab for the templates' own components and connections (#85).
// It sits outside the layers, as the composition root does, because it
// needs the templates (adapters) and the screen (ui), which may not import
// each other.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectA,
  projectB,
} from "../adapters/templates/testing/scenario-runs";
import { createFieldCatalog } from "../application/details/create-field-catalog";
import { awsDescribeSelection } from "../application/testing/aws-describe-selection";
import { sampleRecord } from "../application/testing/sample-record";
import { createAwsComponentRegistry } from "../domain/components/aws";
import type { Component, Edge, Project } from "../domain/model/project";
import { fakeUseCases } from "../ui/app/testing/fake-use-cases";
import { UseCasesProvider } from "../ui/app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../ui/diagram/testing/stub-diagram-browser-apis";
import { OpenedProject } from "../ui/project/OpenedProject";
import { TEST_SHELL, revealButton } from "../ui/project/testing/canvas-panels";
import {
  describedByIds,
  explanationOf,
} from "../ui/shared/testing/explanation-of";
import { preloadBeforeAll } from "../ui/shared/testing/preload-before-all";
import { stubWindowWidth } from "../ui/shared/testing/stub-window-width";

const fields = createFieldCatalog();

/**
 * For a test that goes through every component of a template: 1 to 2.5 s
 * alone, but past the 5 s default while a full run loads every worker.
 */
const EVERY_COMPONENT_TIMEOUT_MS = 20_000;

/** The project on its screen, in a wide window, with the real descriptors. */
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

/** A component's line in the text version: its name and its type in words. */
function textLine(component: Component): string {
  const type = createAwsComponentRegistry().get(component.type);
  return `${component.name} (${type?.displayName ?? component.type})`;
}

/** Clicks an item's button in the diagram's text version, as the keyboard would. */
function selectFromText(name: string): HTMLElement {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
  return button;
}

function detailsTab(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Details" });
}

function detailsHeading(): HTMLElement {
  return within(detailsTab()).getByRole("heading", { level: 4 });
}

/** A text field in Details, by its label. */
function field(name: string): HTMLInputElement {
  return within(detailsTab()).getByRole("textbox", { name });
}

/** A distribution's group of fields in Details, by its label. */
function group(name: string): HTMLElement {
  return within(detailsTab()).getByRole("group", { name });
}

/** The text of everything an element's aria-describedby points at, in order. */
function description(element: Element): string {
  const ids = element.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

/** The labels of the settings in Details, in order: a group's (a distribution's or a retry policy's) once. */
function settingLabels(): (string | null | undefined)[] {
  const fields = [...detailsTab().querySelectorAll("input, fieldset")];
  return fields
    .filter(
      (el) => el.tagName === "FIELDSET" || el.closest("fieldset") === null,
    )
    .map((el) =>
      el instanceof HTMLInputElement
        ? el.labels?.[0]?.textContent
        : el.querySelector("legend")?.textContent,
    )
    .filter((label) => label !== "Name");
}

function selectedTab(): string | null | undefined {
  return screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

describe("the Details tab, for the templates", () => {
  preloadBeforeAll(() => import("../ui/diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if a setting loses its label, its value, its unit, its help, or
  // its default and the default's evidence, or the focus doesn't move to
  // Details.
  it("shows orders-db's name and three settings, each with its unit and default", () => {
    renderProject(projectA);

    selectFromText("orders-db (RDS)");

    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("orders-db · RDS");
    expect(field("Name").value).toBe("orders-db");
    expect(field("Max connections").value).toBe("90");
    expect(description(field("Max connections"))).toMatch(
      /^connections .*max_connections .* Default 90: an assumption \(RDS-1\)\.$/,
    );
    expect(field("Query workers").value).toBe("16");
    expect(description(field("Query workers"))).toMatch(
      /^queries .*RDS has no such setting.* Default 16: an assumption \(RDS-2\)\.$/,
    );
    const queryTime = group("Query time");
    expect(
      within(queryTime).getByRole<HTMLSelectElement>("combobox", {
        name: "Kind",
      }).value,
    ).toBe("lognormal");
    const part = (name: string) =>
      within(queryTime).getByRole<HTMLInputElement>("textbox", { name }).value;
    expect([part("Median"), part("p99")]).toEqual(["15", "60"]);
    expect(description(queryTime)).toMatch(
      /Default lognormal, median 15 ms, p99 60 ms: an assumption\.$/,
    );
    expect(settingLabels()).toEqual([
      "Max connections",
      "Query workers",
      "Query time",
    ]);
  });

  // Fails if a setting's help or default evidence shows before its info
  // control is opened, the control doesn't open and close it, the hidden
  // help stops describing the field, or Reset to default needs the control
  // opened first.
  it("keeps a setting's help and default behind its info control, still describing the field", () => {
    renderProject(projectA);
    selectFromText("orders-db (RDS)");
    const info = within(detailsTab()).getByRole("button", {
      name: "About Max connections",
    });
    // The explanation the control opens: the help paragraph and the default note.
    const { explanation, paragraphId } = explanationOf(info);

    expect(explanation.textContent).toMatch(/max_connections/);
    expect(describedByIds(field("Max connections"))).toContain(paragraphId);
    expect(info.getAttribute("aria-expanded")).toBe("false");
    expect(explanation.hidden).toBe(true);
    expect(description(field("Max connections"))).toMatch(
      /Default 90: an assumption \(RDS-1\)\.$/,
    );
    expect(
      within(detailsTab()).getByRole("button", {
        name: "Reset to default: Max connections",
      }),
    ).toBeTruthy();

    fireEvent.click(info);
    expect(info.getAttribute("aria-expanded")).toBe("true");
    expect(explanation.hidden).toBe(false);

    fireEvent.click(info);
    expect(explanation.hidden).toBe(true);
  });

  // Fails if Escape in a field beside an open info control closes Details
  // instead of the help, or doesn't move the focus to the info button.
  it("closes an open help first on Escape from its field, keeping Details", () => {
    renderProject(projectA);
    selectFromText("orders-db (RDS)");
    const info = within(detailsTab()).getByRole("button", {
      name: "About Max connections",
    });
    fireEvent.click(info);

    fireEvent.keyDown(field("Max connections"), { key: "Escape" });

    expect(info.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(info);
    expect(screen.getByRole("tabpanel", { name: "Details" })).toBeTruthy();
  });

  // Fails if Escape leaves the selection, keeps Details showing, or drops
  // the focus instead of returning it to the button that selected.
  it("clears on Escape, shows Run, and returns the focus to the button", () => {
    renderProject(projectA);
    const button = selectFromText("orders-db (RDS)");

    fireEvent.keyDown(detailsHeading(), { key: "Escape" });

    expect(selectedTab()).toBe("Run");
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole("tabpanel", { name: "Details" })).toBeNull();
    expect(
      revealButton("orders-db (RDS)").getAttribute("aria-current"),
    ).toBeNull();
  });

  // Fails if an edge's latency, timeout, or retry policy is missing or
  // unread, a setting loses its help or its caller type's default (here
  // Lambda's), or the steps along it are missed.
  it("shows an edge's latency, timeout, and retries, and the steps along it", () => {
    renderProject(projectB);

    selectFromText("fn-api → orders-queue");

    expect(detailsHeading().textContent).toBe(
      "fn-api → orders-queue · Connection",
    );
    expect(settingLabels()).toEqual(["Latency", "Timeout", "Retries"]);
    expect([field("Latency").value, field("Timeout").value]).toEqual([
      "1",
      "5000",
    ]);
    expect([field("Attempts").value, field("Base delay").value]).toEqual([
      "3",
      "50",
    ]);
    expect(description(field("Timeout"))).toMatch(
      /\(ENG-5\)\. Default 5,000: an assumption \(ENG-5\)\.$/,
    );
    expect(description(group("Retries"))).toMatch(
      /\(ENG-2\)\. Default 1 attempt, no retries: an assumption \(ENG-2\)\.$/,
    );
    expect(
      within(detailsTab()).getByText("Called along by: Create order (enqueue)"),
    ).toBeTruthy();
  });

  // Fails if "Called by" misses a workflow, lists one that doesn't call
  // the component, or says nothing when no step calls it.
  it("says which workflows call a component, or that none does yet", () => {
    const unused = {
      id: "spare",
      type: "lambda",
      name: "fn-spare",
      config: {},
    };
    renderProject({
      ...projectA,
      architecture: {
        ...projectA.architecture,
        components: [...projectA.architecture.components, unused],
      },
    });

    selectFromText("fn-orders (Lambda)");
    expect(
      within(detailsTab()).getByText("Called by: Get order, Create order"),
    ).toBeTruthy();
    selectFromText("fn-spare (Lambda)");
    expect(
      within(detailsTab()).getByText(
        "Called by: nothing yet. A component does nothing until a workflow step calls it.",
      ),
    ).toBeTruthy();
  });

  // Fails if any component or edge of either template can't be selected
  // from the text version, or shows a setting without its value or help,
  // or any component can't be selected by a click on its box. (jsdom lays
  // nothing out, so React Flow draws no edges to click.)
  it.each([
    ["Template A", projectA],
    ["Template B", projectB],
  ])(
    "selects every component and edge of %s, by keyboard and mouse",
    async (_name, project) => {
      renderProject(project);
      const { components, edges } = project.architecture;

      for (const component of components) {
        selectFromText(textLine(component));
        expectComponentDetails(component);
      }
      for (const edge of edges) {
        const name = edgeName(project, edge);
        selectFromText(name);
        expect(detailsHeading().textContent).toBe(`${name} · Connection`);
        expect(settingLabels()).toEqual(["Latency", "Timeout", "Retries"]);
      }
      for (const component of components) {
        fireEvent.click(await drawnNode(component.id));
        expectComponentDetails(component);
      }
    },
    EVERY_COMPONENT_TIMEOUT_MS,
  );
});

describe("the Details tab, for the templates' workflows", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** The outline's steps, as their buttons read: the ones that start with a step's number. */
  function outlineSteps(): HTMLElement[] {
    const outline = within(detailsTab()).getByRole("list", { name: "Steps" });
    return within(outline)
      .getAllByRole("button")
      .filter((button) => /^[0-9]/.test(button.textContent));
  }

  // Fails if Template A's outlines lose a step, number one wrongly, name a
  // step by an id, or "Used by" misses a workload or loses their order.
  it("outlines Template A's workflows, numbered, with the workloads that use them", () => {
    renderProject(projectA);
    const usedBy =
      "Used by: Lunch rush, 20 s at 2,000 requests/s; Steady day, 200 requests/s; Long rush, 2 min at 2,000 requests/s";

    selectFromText("Get order");
    expect(detailsHeading().textContent).toBe("Get order · Workflow");
    expect(within(detailsTab()).getByText(usedBy)).toBeTruthy();
    expect(outlineSteps().map((step) => step.textContent)).toEqual([
      "1 API Gateway · invoke",
      "1.1 fn-orders · invoke",
      "1.1.1 orders-db · read",
    ]);
    selectFromText("Create order");
    expect(outlineSteps().at(-1)?.textContent).toBe("1.1.1 orders-db · write");
  });

  // Fails if any workflow of either template can't be selected from the
  // list, or any of its steps, async work included, can't be selected
  // from the outline and marked current.
  it.each([
    ["Template A", projectA],
    ["Template B", projectB],
  ])("selects every workflow and step of %s", (_name, project) => {
    renderProject(project);

    for (const workflow of project.workflows) {
      selectFromText(workflow.name);
      expect(detailsHeading().textContent).toBe(`${workflow.name} · Workflow`);
      selectEachStep();
    }
  });

  /** Selects each step of the outline in turn, checking it's marked. */
  function selectEachStep(): void {
    const names = outlineSteps().map((step) => step.textContent);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const step = selectFromText(name);
      expect(step.getAttribute("aria-current"), name).toBe("true");
    }
  }

  // Fails if Template B's enqueue loses its async work, or the async list
  // isn't named by the label that says when it's done (drop its
  // aria-labelledby).
  it("shows Template B's async work under its enqueue", () => {
    renderProject(projectB);

    selectFromText("Create order");

    expect(outlineSteps().map((step) => step.textContent)).toEqual([
      "1 API Gateway · invoke",
      "1.1 fn-api · invoke",
      "1.1.1 orders-queue · enqueue",
      "1.1.1.1 fn-writer · invoke",
      "1.1.1.1.1 orders-db · write",
    ]);
    const asyncWork = within(detailsTab()).getByRole("list", {
      name: "Async work, done when a consumer takes the message",
    });
    expect(
      within(asyncWork)
        .getAllByRole("button")
        .map((step) => step.textContent)
        .filter((text) => /^[0-9]/.test(text)),
    ).toEqual(["1.1.1.1 fn-writer · invoke", "1.1.1.1.1 orders-db · write"]);
  });
});

/**
 * Details shows the component, and a field for every setting its type
 * describes, each with a value, and its help and default.
 */
function expectComponentDetails(component: Component): void {
  expect(detailsHeading().textContent).toMatch(
    new RegExp(`^${component.name} · `),
  );
  const described = fields.get(component.type)?.fields ?? [];
  expect(settingLabels()).toEqual(described.map((f) => f.label));
  for (const { label, kind } of described) {
    const element = kind === "distribution" ? group(label) : field(label);
    if (element instanceof HTMLInputElement) {
      expect(element.value, label).not.toBe("");
    }
    expect(description(element), label).toMatch(/Default .*\.$/);
  }
}

/** "fn-orders → orders-db": the edge's ends by name, as the text version lists it. */
function edgeName(project: Project, edge: Edge): string {
  const nameOf = (id: string) =>
    project.architecture.components.find((c) => c.id === id)?.name ?? id;
  return `${nameOf(edge.from)} → ${nameOf(edge.to)}`;
}

/** The diagram's box for a component, once React Flow has drawn it. */
async function drawnNode(componentId: string): Promise<Element> {
  const selector = `.react-flow__node[data-id="${componentId}"]`;
  await waitFor(() => {
    expect(document.querySelector(selector)).not.toBeNull();
  });
  return document.querySelector(selector) as Element;
}
