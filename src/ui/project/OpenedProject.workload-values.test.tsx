// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import type { Project, Workload } from "../../domain/model/project";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import {
  describedByIds,
  explanationOf,
} from "../shared/testing/explanation-of";
import { revealButton } from "./testing/canvas-panels";
import {
  cantRunRegion,
  clickRun,
  renderOpenedProject as renderProject,
  savedRecord,
  statusRegions,
  undoneRegion,
} from "./testing/render-opened-project";

const [sampleWorkload] = sampleRecord.project.workloads;
if (sampleWorkload === undefined) throw new Error("The sample has a workload");

/** "Steady" with a point at 4 s, and "Lunch rush", which doesn't run. */
const steady: Workload = {
  ...sampleWorkload,
  profile: [
    { atMs: 0, requestsPerSec: 20 },
    { atMs: 4_000, requestsPerSec: 20 },
  ],
};
const twoWorkloads: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "lunch", name: "Lunch rush", mix: [] }],
};

function select(name: string | RegExp): void {
  const button = revealButton(name);
  button.focus();
  fireEvent.click(button);
}

function details(): HTMLElement {
  return screen.getByRole("tabpanel", { name: "Details" });
}

function field(label: "Duration" | "Seed"): HTMLInputElement {
  return within(details()).getByRole("textbox", { name: label });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Undo\b/ });
}

/** Types into a field, which takes the focus. */
function type(label: "Duration" | "Seed", text: string): HTMLInputElement {
  const input = field(label);
  input.focus();
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/** The message the field's `aria-describedby` points at first, if it has one. */
function messageOf(input: HTMLInputElement): string | undefined {
  const [first] = (input.getAttribute("aria-describedby") ?? "").split(" ");
  return document.getElementById(first ?? "")?.textContent ?? undefined;
}

/** Whether the first workload of the record has the value. */
function firstHas(
  key: "durationMs" | "seed",
  value: number,
): (record: { project: Project }) => boolean {
  return (record) => record.project.workloads[0]?.[key] === value;
}

/** Runs "Steady" to its end, with the details of the first workload open. */
async function runSteady(): Promise<ReturnType<typeof renderProject>> {
  const rendered = renderProject({ project: twoWorkloads });
  clickRun();
  rendered.runner.send(sampleSnapshot({ second: 1 }));
  await rendered.runner.finish();
  expect(statusRegions()[1].textContent).toBe("");
  return rendered;
}

describe("OpenedProject's workload duration and seed", () => {
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Fails if the fields don't show the saved values, with the unit and the
  // help tied to the field.
  it("shows the duration in seconds and the seed, each with its help", () => {
    renderProject({ project: twoWorkloads });
    select("Steady");

    expect(field("Duration").value).toBe("5");
    expect(field("Seed").value).toBe("1");
    const described = field("Seed").getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toMatch(
      /^The same seed gives the same run/,
    );
  });

  // Fails if a workload field's help shows before its info control is
  // opened, the control doesn't open and close it, or the hidden help stops
  // describing the field.
  it("keeps the duration's help behind its info control, still describing the field", () => {
    renderProject({ project: twoWorkloads });
    select("Steady");
    const info = within(details()).getByRole("button", {
      name: "About Duration",
    });
    const { explanation, paragraphId } = explanationOf(info);

    expect(explanation.textContent).not.toBe("");
    expect(describedByIds(field("Duration"))).toContain(paragraphId);
    expect(info.getAttribute("aria-expanded")).toBe("false");
    expect(explanation.hidden).toBe(true);

    fireEvent.click(info);
    expect(explanation.hidden).toBe(false);

    fireEvent.click(info);
    expect(explanation.hidden).toBe(true);
  });

  // Fails if Enter doesn't save the duration once, in milliseconds, as an
  // undo step named for it, or Undo doesn't put the field back.
  it("saves a duration on Enter as one named undo step", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    select("Steady");

    const input = type("Duration", "45");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await savedRecord(projects, firstHas("durationMs", 45_000));
    expect(undoButton().textContent).toBe(
      "Undo change Steady's duration to 45 s",
    );
    fireEvent.click(undoButton());
    expect(undoneRegion().textContent).toBe(
      "Undid: change Steady's duration to 45 s.",
    );
    expect(field("Duration").value).toBe("5");
  });

  // Fails if the seed doesn't save on Enter as a named undo step, or Undo
  // doesn't put the field back.
  it("saves a seed on Enter as one named undo step", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    select("Steady");

    fireEvent.keyDown(type("Seed", "7"), { key: "Enter" });

    await savedRecord(projects, firstHas("seed", 7));
    expect(undoButton().textContent).toBe("Undo change Steady's seed to 7");
    fireEvent.click(undoButton());
    expect(field("Seed").value).toBe("1");
  });

  // Fails if leaving the field with a valid value doesn't save it, for
  // either field.
  it("saves on leaving the field", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    select("Steady");

    fireEvent.blur(type("Duration", "0.5"));
    await savedRecord(projects, firstHas("durationMs", 500));
    fireEvent.blur(type("Seed", "4294967295"));
    await savedRecord(projects, firstHas("seed", 4_294_967_295));
  });

  // Fails if a draft that stands for the saved number, "5.0" for 5, stays
  // in the field after leaving it, or becomes an undo step.
  it("shows the saved number again for a draft that changes nothing", () => {
    renderProject({ project: twoWorkloads });
    select("Steady");

    fireEvent.blur(type("Duration", "5.0"));

    expect(field("Duration").value).toBe("5");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if Escape leaves the draft in the field, or saves it.
  it("puts back the saved value on Escape, and saves nothing", () => {
    renderProject({ project: twoWorkloads });
    select("Steady");

    fireEvent.keyDown(type("Duration", "45"), { key: "Escape" });

    expect(field("Duration").value).toBe("5");
    expect(undoButton().getAttribute("aria-disabled")).toBe("true");
  });

  // Fails if 0 s, or a seed past the 32 bits, saves or leaves the field,
  // or its message isn't tied to the field and aria-invalid isn't set.
  it.each([
    ["Duration", "0", "Duration must be more than 0 s."],
    [
      "Seed",
      "5000000000",
      "Seed must be a whole number from 0 to 4,294,967,295.",
    ],
  ] as const)(
    "keeps a refused %s in the field with its message, and saves nothing",
    (label, text, message) => {
      renderProject({ project: twoWorkloads });
      select("Steady");

      const input = type(label, text);
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);

      expect(input.value).toBe(text);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(messageOf(input)).toBe(message);
      expect(undoButton().getAttribute("aria-disabled")).toBe("true");
    },
  );

  // Fails if shortening the duration past a profile point is refused, makes
  // a run issue, or loses the point's note: the workload must still run.
  it("allows a duration shorter than a profile point, with its note", async () => {
    const { projects } = renderProject({ project: twoWorkloads });
    select("Steady");

    fireEvent.keyDown(type("Duration", "3"), { key: "Enter" });

    await savedRecord(projects, firstHas("durationMs", 3_000));
    expect(details().textContent).toContain(
      "After the run's end (3 s). Arrivals follow the line toward this point, and the run stops at 3 s.",
    );
    expect(cantRunRegion().textContent).toBe("");
    expect(screen.getByRole("button", { name: "Run" })).not.toHaveProperty(
      "disabled",
      true,
    );
  });

  // Fails if editing the workload that ran leaves the run current:
  // ADR-0018 compares the whole workload the run used.
  it("marks the run out of date when the workload that ran changes", async () => {
    await runSteady();
    select("Steady");

    fireEvent.keyDown(type("Seed", "7"), { key: "Enter" });

    expect(statusRegions()[1].textContent).toBe("Out of date");
  });

  // Fails if editing a workload the run didn't use marks the run out of
  // date.
  it("keeps the run of another workload current", async () => {
    await runSteady();
    select(/^Lunch rush/);

    fireEvent.keyDown(type("Duration", "9"), { key: "Enter" });

    expect(field("Duration").value).toBe("9");
    expect(statusRegions()[1].textContent).toBe("");
  });
});
