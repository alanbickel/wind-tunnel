import type { RequestSettings } from "../components/component-behavior";
import type {
  ComponentRegistry,
  ComponentType,
} from "../components/component-registry";
import type { Edge, Project, Step, Workflow, Workload } from "../model/project";
import { stepsOfWorkflow } from "../model/step-tree";
import type { RuntimeComponent, Visit } from "./runtime-records";
import type { RandomStreams } from "./simulation-events";
import type { Topology } from "./topology";

export interface ProjectTopologyInput {
  readonly components: ReadonlyMap<string, RuntimeComponent>;
  readonly edges: readonly Edge[];
  readonly workflows: readonly Workflow[];
  /** Each step's parsed request settings, by step ID. */
  readonly settings: ReadonlyMap<string, RequestSettings>;
}

/** A `Topology` over maps built once, at the start of a run. */
export class ProjectTopology implements Topology {
  private readonly components: ReadonlyMap<string, RuntimeComponent>;
  /** Keyed by `edgeKey(from, to)`. */
  private readonly edges: ReadonlyMap<string, Edge>;
  private readonly workflows: ReadonlyMap<string, Workflow>;
  private readonly settings: ReadonlyMap<string, RequestSettings>;

  constructor(input: ProjectTopologyInput) {
    this.components = input.components;
    this.edges = indexEdges(input.edges);
    this.workflows = new Map(input.workflows.map((w) => [w.id, w]));
    this.settings = input.settings;
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

  settingsFor(step: Step): RequestSettings {
    const settings = this.settings.get(step.id);
    if (settings === undefined) {
      throw new Error(`No request settings for step "${step.id}"`);
    }
    return settings;
  }
}

export interface TopologyInput {
  readonly project: Project;
  readonly registry: ComponentRegistry;
  /** Each component gets the stream named `component:<id>`. */
  readonly random: RandomStreams;
  /** The run's workload: the steps of its mix's workflows get settings. */
  readonly workload: Workload;
}

/**
 * Builds each component's behavior from the registry, parses the request
 * settings of each step the workload can reach, then builds the topology.
 */
export function buildTopology(input: TopologyInput): ProjectTopology {
  const { architecture, workflows } = input.project;
  const components = buildComponents(input);
  return new ProjectTopology({
    components,
    edges: architecture.edges,
    workflows,
    settings: parseStepSettings(input),
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
      rejectionReasons: type.rejectionReasons,
      peakInProgress: 0,
      peakQueueDepth: 0,
      limitPeaks: (behavior.limits ?? []).map(() => 0),
    });
  }
  return components;
}

/**
 * Each step's request settings, parsed by its component's type with the
 * defaults filled in, by step ID: once per step, not per arrival
 * (ADR-0024 decision 3.2). Only the workload's workflows are parsed, since
 * a workflow it doesn't run may have run issues. Throws on settings that
 * don't fit, which the run checks rule out.
 */
function parseStepSettings({
  project,
  registry,
  workload,
}: TopologyInput): Map<string, RequestSettings> {
  const typeById = new Map(
    project.architecture.components.map((c) => [c.id, registry.get(c.type)]),
  );
  const typeOf = (step: Step): ComponentType => {
    const type = typeById.get(step.componentId);
    if (type === undefined)
      throw new Error(`No component "${step.componentId}"`);
    return type;
  };
  const inMix = new Set(workload.mix.map((m) => m.workflowId));
  const steps = project.workflows
    .filter((w) => inMix.has(w.id))
    .flatMap(stepsOfWorkflow);
  return new Map(
    steps.map((step) => [
      step.id,
      typeOf(step).parseSettings(step.action, step.settings),
    ]),
  );
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
