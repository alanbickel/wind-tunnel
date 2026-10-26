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
import type { Component, Edge, Project } from "../domain/model/project";
import { fakeUseCases } from "../ui/app/testing/fake-use-cases";
import { UseCasesProvider } from "../ui/app/UseCasesProvider";
import { stubDiagramBrowserApis } from "../ui/diagram/testing/stub-diagram-browser-apis";
import { OpenedProject } from "../ui/project/OpenedProject";
import { preloadBeforeAll } from "../ui/shared/testing/preload-before-all";
import { stubWindowWidth } from "../ui/shared/testing/stub-window-width";

const fields = createFieldCatalog();

/** The project on its screen, in a wide window, with the real descriptors. */
function renderProject(project: Project): void {
  stubWindowWidth("wide");
  const useCases = fakeUseCases({ describeSelection: awsDescribeSelection() });
  render(
    <UseCasesProvider useCases={useCases}>
      <OpenedProject
        record={{ ...sampleRecord, project, layout: { nodes: {} } }}
      />
    </UseCasesProvider>,
  );
}

/** Clicks an item's button in the diagram's text version, as the keyboard would. */
function selectFromText(name: string): HTMLElement {
  const button = screen.getByRole("button", { name });
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

/** Each setting in Details: its label, its value, and its help. */
function settings(): string[][] {
  const terms = within(detailsTab()).queryAllByRole("term");
  return terms.map((term) => [
    term.textContent,
    ...[...(term.parentElement?.querySelectorAll("dd") ?? [])].map(
      (dd) => dd.textContent,
    ),
  ]);
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

  // Fails if a setting loses its label, its unit, its help, or its default
  // and the default's evidence, or the focus doesn't move to Details.
  it("shows orders-db's three settings, each with its unit and default", () => {
    renderProject(projectA);

    selectFromText("orders-db (rds)");

    expect(document.activeElement).toBe(detailsHeading());
    expect(detailsHeading().textContent).toBe("orders-db · RDS");
    const [connections, workers, queryTime] = settings();
    expect(connections?.slice(0, 2)).toEqual([
      "Max connections",
      "90 connections",
    ]);
    expect(connections?.[2]).toMatch(
      /max_connections .* Default 90: an assumption \(RDS-1\)\.$/,
    );
    expect(workers?.slice(0, 2)).toEqual(["Query workers", "16 queries"]);
    expect(workers?.[2]).toMatch(
      /RDS has no such setting.* Default 16: an assumption \(RDS-2\)\.$/,
    );
    expect(queryTime?.slice(0, 2)).toEqual([
      "Query time",
      "lognormal, median 15 ms, p99 60 ms",
    ]);
    expect(queryTime?.[2]).toMatch(
      /Default lognormal, median 15 ms, p99 60 ms: an assumption\.$/,
    );
    expect(settings()).toHaveLength(3);
  });

  // Fails if Escape leaves the selection, keeps Details showing, or drops
  // the focus instead of returning it to the button that selected.
  it("clears on Escape, shows Run, and returns the focus to the button", () => {
    renderProject(projectA);
    const button = selectFromText("orders-db (rds)");

    fireEvent.keyDown(detailsHeading(), { key: "Escape" });

    expect(selectedTab()).toBe("Run");
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "orders-db (rds)" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  // Fails if an edge's latency, timeout, or retry policy is missing or
  // unread, an edge shows a default, or the steps along it are missed.
  it("shows an edge's latency, timeout, and retries, and the steps along it", () => {
    renderProject(projectB);

    selectFromText("fn-api → orders-queue");

    expect(detailsHeading().textContent).toBe(
      "fn-api → orders-queue · Connection",
    );
    expect(settings().map((setting) => setting.slice(0, 2))).toEqual([
      ["Latency", "1 ms"],
      ["Timeout", "5,000 ms"],
      [
        "Retries",
        "3 attempts, backing off exponentially, with jitter, from 50 ms",
      ],
    ]);
    for (const [, , help] of settings()) {
      expect(help).toMatch(/\(ENG-\d\)\.$/);
      expect(help).not.toContain("Default");
    }
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

    selectFromText("fn-orders (lambda)");
    expect(
      within(detailsTab()).getByText("Called by: Get order, Create order"),
    ).toBeTruthy();
    selectFromText("fn-spare (lambda)");
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
        selectFromText(`${component.name} (${component.type})`);
        expectComponentDetails(component);
      }
      for (const edge of edges) {
        const name = edgeName(project, edge);
        selectFromText(name);
        expect(detailsHeading().textContent).toBe(`${name} · Connection`);
        expect(settings()).toHaveLength(3);
      }
      for (const component of components) {
        fireEvent.click(await drawnNode(component.id));
        expectComponentDetails(component);
      }
    },
  );
});

/** Details shows the component, and every setting its type describes, with a value and help. */
function expectComponentDetails(component: Component): void {
  expect(detailsHeading().textContent).toMatch(
    new RegExp(`^${component.name} · `),
  );
  const described = fields.get(component.type)?.fields ?? [];
  expect(settings()).toHaveLength(described.length);
  for (const [, value, help] of settings()) {
    expect(value, component.name).not.toBe("");
    expect(help, component.name).toMatch(/Default .*.$/);
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
