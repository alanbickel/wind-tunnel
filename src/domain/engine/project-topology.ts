import type { ComponentRegistry } from "../components/component-registry";
import type { Edge, Project, Workflow, Workload } from "../model/project";
import type { RuntimeComponent, Visit } from "./runtime-records";
import type { RandomStreams } from "./simulation-events";
import type { Topology } from "./topology";

export interface ProjectTopologyInput {
  readonly components: ReadonlyMap<string, RuntimeComponent>;
  readonly edges: readonly Edge[];
  readonly workflows: readonly Workflow[];
}

/** A `Topology` over maps built once, at the start of a run. */
export class ProjectTopology implements Topology {
  private readonly components: ReadonlyMap<string, RuntimeComponent>;
  /** Keyed by `edgeKey(from, to)`. */
  private readonly edges: ReadonlyMap<string, Edge>;
  private readonly workflows: ReadonlyMap<string, Workflow>;

  constructor({ components, edges, workflows }: ProjectTopologyInput) {
    this.components = components;
    this.edges = indexEdges(edges);
    this.workflows = new Map(workflows.map((w) => [w.id, w]));
  }

  component(id: string): RuntimeComponent {
    const component = this.components.get(id);
    if (component === undefined) throw new Error(`No component "${id}"`);
    return component;
  }

  allComponents(): Iterable<RuntimeComponent> {
    return this.components.values();
  }

  edgeFor(fromId: string | undefined, toId: string): Edge | undefined {
    if (fromId === undefined) return undefined;
    const edge = this.edges.get(edgeKey(fromId, toId));
    if (edge === undefined) {
      throw new Error(`No edge from "${fromId}" to "${toId}"`);
    }
    return edge;
  }

  workflow(id: string): Workflow {
    const workflow = this.workflows.get(id);
    if (workflow === undefined) throw new Error(`No workflow "${id}"`);
    return workflow;
  }
}

export interface TopologyInput {
  readonly project: Project;
  readonly registry: ComponentRegistry;
  /** Each component gets the stream named `component:<id>`. */
  readonly random: RandomStreams;
}

/** Builds each component's behavior from the registry, then the topology. */
export function buildTopology(input: TopologyInput): ProjectTopology {
  const { architecture, workflows } = input.project;
  const components = buildComponents(input);
  return new ProjectTopology({
    components,
    edges: architecture.edges,
    workflows,
  });
}

/**
 * The workload a run uses. Separate from the topology because the workload's
 * seed is needed to build the components' random streams.
 */
export function findWorkload(project: Project, workloadId: string): Workload {
  const workload = project.workloads.find((w) => w.id === workloadId);
  if (workload === undefined) throw new Error(`No workload "${workloadId}"`);
  return workload;
}

/** Builds each component's behavior from its type in the registry. */
function buildComponents({
  project,
  registry,
  random,
}: TopologyInput): Map<string, RuntimeComponent> {
  const components = new Map<string, RuntimeComponent>();
  for (const component of project.architecture.components) {
    const type = registry.get(component.type);
    if (type === undefined) {
      throw new Error(`Unknown component type "${component.type}"`);
    }
    const behavior = type.build<Visit>(component.config, {
      random: random(`component:${component.id}`),
    });
    components.set(component.id, {
      id: component.id,
      behavior,
      peakInProgress: 0,
      peakQueueDepth: 0,
    });
  }
  return components;
}

/** Edges by their endpoints. Validation rejects duplicates; the first wins. */
function indexEdges(edges: readonly Edge[]): Map<string, Edge> {
  const byEnds = new Map<string, Edge>();
  for (const edge of edges) {
    const key = edgeKey(edge.from, edge.to);
    if (!byEnds.has(key)) byEnds.set(key, edge);
  }
  return byEnds;
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}
