// @vitest-environment jsdom
// Editing a component's settings in the Details tab, on the templates'
// own components (#90, UX design §2.2). It sits outside the layers, as the
// composition root does, because it needs the templates (adapters) and the
// screen (ui), which may not import each other.
import {
  cleanup,
  fireEvent,
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
import type { ConfigFieldDescriptor } from "../application/details/field-descriptor";
import type { ProjectRecord } from "../application/ports/project-record";
import { InMemoryProjectRepository } from "../application/testing/in-memory-project-repository";
import { awsSaveProject } from "../application/testing/aws-save-project";
import { createAwsComponentRegistry } from "../domain/components/aws";
import type { Component, Project } from "../domain/model/project";
import type { UseCases } from "../ui/app/use-cases";
import { stubDiagramBrowserApis } from "../ui/diagram/testing/stub-diagram-browser-apis";
import { renderOpenedProject } from "../ui/project/testing/render-opened-project";

/** Renders the project, and selects a component from the diagram's text version. */
function openAndSelect(
  project: Project,
  componentName: string,
  saveProject?: UseCases["saveProject"],
) {
  const rendered = renderOpenedProject({ project, saveProject });
  const component = project.architecture.components.find(
    (c) => c.name === componentName,
  );
  if (component === undefined) throw new Error(`no ${componentName}`);
  fireEvent.click(
    screen.getByRole("button", {
      name: `${component.name} (${component.type})`,
    }),
  );
  return rendered;
}

function detailsTab(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Details" });
}

/** A text field in Details, by its label, within `container` if given. */
function field(name: string, container = detailsTab()): HTMLInputElement {
  return within(container).getByRole("textbox", { name });
}

function group(name: string): HTMLElement {
  return within(detailsTab()).getByRole("group", { name });
}

/** Types into a field and leaves it, as a user tabbing on would. */
function typeAndLeave(input: HTMLInputElement, text: string): void {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

/** The element the field's aria-describedby names first: its message, if it has one. */
function firstDescription(input: HTMLElement): string | null | undefined {
  const [first] = input.getAttribute("aria-describedby")?.split(" ") ?? [];
  return first === undefined
    ? undefined
    : document.getElementById(first)?.textContent;
}

/** The project bar's status regions: run status, out of date, save failure. */
function barStatus(project: Project): (string | null)[] {
  const bar = screen.getByRole("region", { name: project.name });
  return within(bar)
    .getAllByRole("status")
    .map((region) => region.textContent);
}

/** The record saved for `project`, once a save lands. */
async function savedRecord(
  projects: InMemoryProjectRepository,
  project: Project,
): Promise<ProjectRecord> {
  let saved: ProjectRecord | undefined;
  await waitFor(async () => {
    const lookup = await projects.get(project.id);
    if (lookup.status !== "found") throw new Error("not saved yet");
    saved = lookup.record;
  });
  if (saved === undefined) throw new Error("not saved");
  return saved;
}

/** A component's config in a saved record. */
function configIn(record: ProjectRecord, name: string) {
  return record.project.architecture.components.find((c) => c.name === name)
    ?.config;
}

describe("editing a component's settings", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if leaving the field doesn't save, the save isn't of the new
  // value, or the run on screen isn't marked out of date by the change.
  it("saves query workers on leaving the field, and the run goes out of date", async () => {
    const { runner, projects } = openAndSelect(projectA, "orders-db");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await runner.finish();
    expect(barStatus(projectA)[1]).toBe("");

    typeAndLeave(field("Query workers"), "64");

    const saved = await savedRecord(projects, projectA);
    expect(configIn(saved, "orders-db")?.["queryWorkers"]).toBe(64);
    expect(barStatus(projectA)[1]).toBe("Out of date");
    expect(field("Query workers").value).toBe("64");
  });

  // Fails if a failing draft reaches the project (it would save, or the
  // run would go out of date), its message isn't tied to the field, or
  // Escape doesn't put the saved value back.
  it("holds 0 as a draft with its message, and Escape puts back the value", async () => {
    const { runner, projects } = openAndSelect(projectA, "orders-db");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await runner.finish();
    const workers = field("Query workers");

    typeAndLeave(workers, "0");

    expect(workers.getAttribute("aria-invalid")).toBe("true");
    expect(firstDescription(workers)).toBe("Query workers must be at least 1.");
    expect(barStatus(projectA)[1]).toBe("");
    fireEvent.keyDown(workers, { key: "Escape" });
    expect(workers.value).toBe("16");
    expect(workers.getAttribute("aria-invalid")).toBe("false");
    expect(firstDescription(workers)).toBe("queries");
    expect(await projects.list()).toEqual([]);
  });

  // Fails if leaving a field with a failing draft doesn't put its message
  // in a polite status region, or moves the focus to it.
  it("announces a failing draft's message as the field is left", () => {
    openAndSelect(projectA, "orders-db");
    const [region] = within(detailsTab()).getAllByRole("status");
    expect(region?.textContent).toBe("");
    const workers = field("Query workers");

    typeAndLeave(workers, "0");

    expect(region?.textContent).toBe("Query workers must be at least 1.");
    expect(region?.getAttribute("aria-live") ?? "polite").toBe("polite");
  });

  // Fails if Escape on a field with no draft to put back doesn't go on to
  // close Details, as it does everywhere else in it.
  it("closes Details on Escape when there's no draft to put back", () => {
    openAndSelect(projectA, "orders-db");

    fireEvent.keyDown(field("Query workers"), { key: "Escape" });

    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  // Fails if the p99 rule is unchecked or worded on the wrong field, or a
  // switch to constant leaves the value empty instead of the median.
  it("checks a p99 below the median, and fills a constant from the median", async () => {
    const { projects } = openAndSelect(projectA, "orders-db");
    const queryTime = group("Query time");
    const p99 = field("p99", queryTime);

    typeAndLeave(p99, "10");
    expect(p99.getAttribute("aria-invalid")).toBe("true");
    expect(firstDescription(p99)).toBe(
      "The p99 must be at least the median (15 ms).",
    );
    fireEvent.keyDown(p99, { key: "Escape" });
    expect(p99.value).toBe("60");

    fireEvent.change(
      within(queryTime).getByRole("combobox", { name: "Kind" }),
      { target: { value: "constant" } },
    );

    expect(field("Value", queryTime).value).toBe("15");
    const saved = await savedRecord(projects, projectA);
    expect(configIn(saved, "orders-db")?.["queryTime"]).toEqual({
      kind: "constant",
      valueMs: 15,
    });
  });

  // Fails if a name another component of the type uses can be saved, or
  // its message isn't the user's.
  it("refuses a name another Lambda uses, and doesn't save it", async () => {
    const { projects } = openAndSelect(projectB, "fn-api");
    const name = field("Name");

    typeAndLeave(name, "fn-writer");

    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(firstDescription(name)).toBe(
      "Another Lambda component already uses this name. Please choose another name.",
    );
    expect(await projects.list()).toEqual([]);
    typeAndLeave(name, "fn-orders-api");
    const saved = await savedRecord(projects, projectB);
    expect(
      saved.project.architecture.components.find((c) => c.id === "fn-api")
        ?.name,
    ).toBe("fn-orders-api");
  });

  // Fails if a failed save isn't said in the bar, the change leaves the
  // screen, or Try again doesn't save it.
  it("says a save failed, keeps the change, and Try again saves it", async () => {
    const projects = new InMemoryProjectRepository();
    const execute = vi.fn<UseCases["saveProject"]["execute"]>();
    execute.mockRejectedValueOnce(new Error("The quota is full."));
    execute.mockImplementation((record) =>
      awsSaveProject(projects).execute(record),
    );
    openAndSelect(projectA, "orders-db", { execute });

    typeAndLeave(field("Query workers"), "64");

    await waitFor(() => {
      expect(barStatus(projectA)[2]).toBe("Couldn't save your last change.");
    });
    expect(field("Query workers").value).toBe("64");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const saved = await savedRecord(projects, projectA);
    expect(configIn(saved, "orders-db")?.["queryWorkers"]).toBe(64);
    await waitFor(() => {
      expect(barStatus(projectA)[2]).toBe("");
    });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

const registry = createAwsComponentRegistry();
const catalog = createFieldCatalog();

/**
 * For a test that goes through every component of a template: 1 to 2.5 s
 * alone, but past the 5 s default while a full run loads every worker.
 */
const EVERY_COMPONENT_TIMEOUT_MS = 20_000;

/** A setting of the selected component, and where its saves land. */
interface SettingUnderTest {
  readonly project: Project;
  readonly component: Component;
  readonly field: ConfigFieldDescriptor;
  readonly projects: InMemoryProjectRepository;
}

/** The setting's input: the field, or a distribution's first part. */
function inputFor({ kind, label }: ConfigFieldDescriptor): HTMLInputElement {
  if (kind !== "distribution") return field(label);
  const [first] = within(group(label)).getAllByRole<HTMLInputElement>(
    "textbox",
  );
  if (first === undefined) throw new Error(`${label} has no parts`);
  return first;
}

/** The setting's value in the record saved last. */
async function savedValue(setting: SettingUnderTest): Promise<unknown> {
  const saved = await savedRecord(setting.projects, setting.project);
  return configIn(saved, setting.component.name)?.[setting.field.key];
}

/**
 * Edits a setting to one more than it shows, which passes every range,
 * then resets it, waiting for each save.
 */
async function editAndReset(setting: SettingUnderTest): Promise<void> {
  const { component, field: descriptor } = setting;
  const before = component.config[descriptor.key];
  const input = inputFor(descriptor);

  typeAndLeave(input, String(Number(input.value) + 1));
  await waitFor(async () => {
    expect(await savedValue(setting)).not.toEqual(before);
  });
  fireEvent.click(
    within(detailsTab()).getByRole("button", {
      name: `Reset to default: ${descriptor.label}`,
    }),
  );

  const defaults = registry.get(component.type)?.defaultConfig;
  await waitFor(async () => {
    expect(await savedValue(setting)).toEqual(
      (defaults as Record<string, unknown>)[descriptor.key],
    );
  });
  // The field starts again from the saved value, not the typed one.
  if (descriptor.kind !== "distribution") {
    expect(inputFor(descriptor).value).toBe(String(await savedValue(setting)));
  }
}

describe("every setting of the templates", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if any component setting in either template can't be edited and
  // saved from its field, or reset to its type's default.
  it.each([
    ["Template A", projectA],
    ["Template B", projectB],
  ])(
    "edits, saves, and resets each of %s's settings",
    async (_name, project) => {
      for (const component of project.architecture.components) {
        const { projects, unmount } = openAndSelect(project, component.name);
        for (const descriptor of catalog.get(component.type)?.fields ?? []) {
          await editAndReset({
            project,
            component,
            field: descriptor,
            projects,
          });
        }
        unmount();
      }
    },
    EVERY_COMPONENT_TIMEOUT_MS,
  );
});
