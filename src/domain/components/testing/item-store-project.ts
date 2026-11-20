import type {
  Component,
  Project,
  Step,
  StepSettings,
} from "../../model/project";
import { ComponentRegistryMap } from "../component-registry-map";
import { itemStoreDefinition, workerPoolDefinition } from "./fake-definitions";
import { loadWorkload, plainEdge } from "./queued-project";

/** The fake registry with the item store, whose reads take request settings. */
export function itemStoreRegistry(): ComponentRegistryMap {
  return new ComponentRegistryMap()
    .register(workerPoolDefinition)
    .register(itemStoreDefinition);
}

/** `front · invoke`, which calls `store` with `call`. */
export function frontCalling(call: Step): Step {
  return {
    id: "front-invoke",
    componentId: "front",
    action: "invoke",
    calls: [call],
  };
}

/** A `store · read` step with these request settings, or none. */
export function storeRead(settings?: StepSettings): Step {
  return {
    id: "store-read",
    componentId: "store",
    action: "read",
    ...(settings && { settings }),
  };
}

/**
 * A project over `itemStoreRegistry` that passes every check: a worker pool
 * "front" that calls an item store "store", and the workflow "w", `root`,
 * which the workload "load" runs alone. `front` serves in 1 ms.
 */
export function itemStoreProject(root: Step): Project {
  return {
    id: "p",
    name: "Item store",
    architecture: {
      components: [front(), store()],
      edges: [plainEdge("front", "store")],
    },
    workflows: [{ id: "w", name: "W", root }],
    workloads: [loadWorkload({ mix: [{ workflowId: "w", weight: 1 }] })],
  };
}

function front(): Component {
  const { type } = workerPoolDefinition;
  const config = { workers: 4, serviceTime: { kind: "constant", valueMs: 1 } };
  return { id: "front", type, name: "front", config };
}

function store(): Component {
  const { type, defaultConfig: config } = itemStoreDefinition;
  return { id: "store", type, name: "store", config };
}
