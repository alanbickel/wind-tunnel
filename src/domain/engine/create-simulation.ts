import { deriveSeed } from "../random/random-source";
import { SeededRandom } from "../random/seeded-random";
import { HeapEventQueue } from "./heap-event-queue";
import {
  IntervalTickSampler,
  type IntervalTickSamplerDependencies,
} from "./interval-tick-sampler";
import { NoTickSampler } from "./no-tick-sampler";
import { PoissonArrivalProcess } from "./poisson-arrival-process";
import { buildTopology, findWorkload } from "./project-topology";
import type { ScheduledWork } from "./scheduled-work";
import { Simulation } from "./simulation";
import type { TickSampler } from "./tick-sampler";
import type {
  RandomStreams,
  SimulationInput,
  SimulationResult,
} from "./simulation-events";

/**
 * Runs a workload against a project's architecture (MVP design §4): a
 * discrete-event loop that jumps from one event to the next. Deterministic:
 * the same input always produces the same events.
 */
export function simulate(input: SimulationInput): SimulationResult {
  return createSimulation(input).run();
}

/** Builds a run's collaborators from its input and wires them together. */
export function createSimulation(input: SimulationInput): Simulation {
  const { project, registry } = input;
  const workload = findWorkload(project, input.workloadId);
  const random = input.random ?? seededStreams(workload.seed);
  // Streams are created in this order; scripted sources in tests rely on it.
  const topology = buildTopology({ project, registry, random });
  const arrivals = new PoissonArrivalProcess({
    workload,
    timing: random("arrivals"),
    choice: random("workflows"),
  });
  const retryRandom = random("retries");
  const observe = input.observer ?? ignoreEvent;
  const untilMs = input.untilMs ?? workload.durationMs;
  const ticks = buildTickSampler({
    topology,
    observe,
    tickMs: input.tickMs,
    untilMs,
  });
  const events = new HeapEventQueue<ScheduledWork>();
  return new Simulation({
    events,
    topology,
    arrivals,
    ticks,
    retryRandom,
    observe,
    untilMs,
  });
}

interface TickSamplerInput extends Omit<
  IntervalTickSamplerDependencies,
  "tickMs"
> {
  readonly tickMs: number | undefined;
}

/** Ticks every `tickMs` if it's set; otherwise none, and no peak tracking. */
function buildTickSampler(input: TickSamplerInput): TickSampler {
  const { tickMs } = input;
  if (tickMs === undefined) return new NoTickSampler();
  return new IntervalTickSampler({ ...input, tickMs });
}

/** Streams seeded from the workload's seed, one per name. */
function seededStreams(seed: number): RandomStreams {
  return (stream) => new SeededRandom(deriveSeed(seed, stream));
}

function ignoreEvent(): void {
  // No observer: events are dropped.
}
