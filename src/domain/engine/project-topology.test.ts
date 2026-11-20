import { describe, expect, it } from "vitest";
import {
  frontCalling,
  itemStoreProject,
  itemStoreRegistry,
  storeRead,
} from "../components/testing/item-store-project";
import type { Project, Step, StepSettings } from "../model/project";
import { simulate } from "./create-simulation";
import type { SimulationEvent } from "./simulation-events";

// A step's request settings reach its component's `arrive`, parsed when the
// run is built (ADR-0024 decision 3). The test type's reads take
// `itemSizeKb` × `msPerKb`, so the store's service time shows which
// settings it got.

/** The service time of every request the store started in a short run of `project`. */
function storeServiceTimes(project: Project): number[] {
  const events: SimulationEvent[] = [];
  simulate({
    project,
    registry: itemStoreRegistry(),
    workloadId: "load",
    untilMs: 1_000,
    observer: (event) => events.push(event),
  });
  return events.flatMap((e) =>
    e.kind === "component-started" && e.componentId === "store"
      ? [e.serviceMs]
      : [],
  );
}

/** Every distinct service time the store gave reads with these settings. */
const readTimes = (settings?: StepSettings) => [
  ...new Set(
    storeServiceTimes(itemStoreProject(frontCalling(storeRead(settings)))),
  ),
];

describe("request settings in a run", () => {
  // Fails if the engine stops passing the step's settings to arrive, or passes them unparsed (msPerKb missing gives NaN).
  it("gives arrive the step's settings, with the defaults filled in", () => {
    expect(readTimes({ itemSizeKb: 40 })).toEqual([40]);
    expect(readTimes({ itemSizeKb: 40, msPerKb: 0.5 })).toEqual([20]);
  });

  // Fails if a step without settings gets {} rather than the defaults (4 KB × 1 ms).
  it("gives a step that sets none the defaults", () => {
    expect(readTimes()).toEqual([4]);
  });

  // Fails if the topology parses the settings of workflows the workload doesn't run, so one with invalid settings throws.
  it("runs when a workflow outside the workload's mix has settings that don't fit", () => {
    const project = itemStoreProject(frontCalling(storeRead()));
    const broken: Step = { ...storeRead({ itemSizeKb: 0 }), id: "bad-read" };
    const root: Step = { ...frontCalling(broken), id: "unrun-root" };
    const unrun = { id: "unrun", name: "Unrun", root };
    const withUnrun = { ...project, workflows: [...project.workflows, unrun] };
    expect(new Set(storeServiceTimes(withUnrun))).toEqual(new Set([4]));
  });
});
