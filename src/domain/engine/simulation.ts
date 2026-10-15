import type {
  ComponentBehavior,
  Effect,
} from "../components/component-behavior";
import type { ComponentRegistry } from "../components/component-registry";
import type {
  Edge,
  Project,
  Step,
  StepAction,
  Workflow,
  Workload,
} from "../model/project";
import {
  deriveSeed,
  SeededRandom,
  type RandomSource,
} from "../random/random-source";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import { ArrivalProcess } from "./arrivals";
import { backoffMs } from "./backoff";
import { EventQueue } from "./event-queue";

/** Why a call failed, and where. */
export interface Failure {
  /** The component that rejected the request, or that the caller gave up on. */
  readonly componentId: string;
  /** The component's rejection reason (e.g. `"throttled"`), or `"timeout"`. */
  readonly reason: string;
}

/** One component's state at a metrics tick. */
export interface ComponentSample {
  readonly componentId: string;
  readonly inProgress: number;
  readonly queueDepth: number;
  /** Highest values since the previous tick (or the start). */
  readonly peakInProgress: number;
  readonly peakQueueDepth: number;
  /** The component's type-specific values; see `ComponentBehavior`. */
  readonly gauges: Readonly<Record<string, number>>;
  readonly counters: Readonly<Record<string, number>>;
}

/**
 * What happened during a run, reported to the observer as it happens.
 * `requestId` identifies the user request (one workflow run) that the work
 * belongs to, including its retries and async work.
 */
export type SimulationEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | ArrivedEvent
  | QueuedEvent
  | StartedEvent
  | RejectedEvent
  | FinishedEvent
  | AttemptFailedEvent
  | DispatchedEvent
  | AsyncFinishedEvent
  | TickEvent;

/** Fields every event about one user request has. */
export interface RequestEventBase {
  readonly timeMs: number;
  readonly requestId: number;
}

/** Fields every event about a request at one component has. */
export interface ComponentEventBase extends RequestEventBase {
  readonly componentId: string;
}

export interface WorkflowStartedEvent extends RequestEventBase {
  readonly kind: "workflow-started";
  readonly workflowId: string;
}

/** The user got an answer. Async work may still be pending. */
export interface WorkflowFinishedEvent extends RequestEventBase {
  readonly kind: "workflow-finished";
  readonly workflowId: string;
  readonly latencyMs: number;
  readonly failure?: Failure;
}

export interface ArrivedEvent extends ComponentEventBase {
  readonly kind: "arrived";
  readonly action: StepAction;
}

export interface QueuedEvent extends ComponentEventBase {
  readonly kind: "queued";
}

export interface StartedEvent extends ComponentEventBase {
  readonly kind: "started";
  readonly serviceMs: number;
}

export interface RejectedEvent extends ComponentEventBase {
  readonly kind: "rejected";
  readonly reason: string;
}

/** Work at a component ended; `latencyMs` counts from its arrival. */
export interface FinishedEvent extends ComponentEventBase {
  readonly kind: "finished";
  readonly latencyMs: number;
  readonly failure?: Failure;
}

/** One attempt along an edge failed. `retryAtMs` is set if another follows. */
export interface AttemptFailedEvent extends RequestEventBase {
  readonly kind: "attempt-failed";
  readonly edgeId: string;
  readonly attempt: number;
  readonly failure: Failure;
  readonly retryAtMs?: number;
}

export interface DispatchedEvent extends ComponentEventBase {
  readonly kind: "dispatched";
}

/** A delivery of async work ended; `latencyMs` counts from the workflow's start. */
export interface AsyncFinishedEvent extends ComponentEventBase {
  readonly kind: "async-finished";
  readonly latencyMs: number;
  readonly succeeded: boolean;
}

/**
 * A metrics tick (only when `tickMs` is set): every component's state now.
 * Comes before any other event at the same time, so it closes the window of
 * events strictly before `timeMs`. The last tick is at the end of the run and
 * also covers events at exactly that time.
 */
export interface TickEvent {
  readonly kind: "tick";
  readonly timeMs: number;
  readonly components: readonly ComponentSample[];
}

export interface SimulationInput {
  /** A project that passed `validateProject` and `validateComponents`. */
  readonly project: Project;
  readonly workloadId: string;
  readonly registry: ComponentRegistry;
  readonly observer?: (event: SimulationEvent) => void;
  /**
   * The random stream for a name such as `"arrivals"` or
   * `"component:orders-db"`. Defaults to streams seeded from the workload's
   * seed with `deriveSeed`; tests can pass scripted sources.
   */
  readonly random?: (stream: string) => RandomSource;
  /** Stop at this simulated time. Defaults to the workload's duration. */
  readonly untilMs?: number;
  /**
   * Report a `tick` every `tickMs` of simulated time, plus one at the end.
   * Off by default.
   */
  readonly tickMs?: number;
}

export interface SimulationResult {
  readonly eventsProcessed: number;
}

/**
 * More events than this at one simulated instant means the run is stuck in a
 * loop that never advances time, e.g. a queue redelivering instantly to a
 * consumer that rejects instantly over a zero-latency edge.
 */
export const MAX_EVENTS_AT_ONE_INSTANT = 1_000_000;

/**
 * Runs a workload against a project's architecture (MVP design §4): a
 * discrete-event loop that jumps from one event to the next. Deterministic:
 * the same input always produces the same events.
 */
export function simulate(input: SimulationInput): SimulationResult {
  return new Simulation(input).run();
}

interface RuntimeComponent {
  readonly id: string;
  readonly behavior: ComponentBehavior<Visit>;
  /** Highest values since the last tick. */
  peakInProgress: number;
  peakQueueDepth: number;
}

/** One user request: a single run of a workflow. */
interface UserRequest {
  readonly id: number;
  readonly workflowId: string;
  readonly startMs: number;
}

/**
 * A call from a caller to a step's component: one or more attempts, as the
 * edge's retry policy allows. The user's call to a workflow's root has no
 * edge: no latency, no timeout, and no retries.
 */
interface Call {
  readonly step: Step;
  readonly target: RuntimeComponent;
  readonly edge: Edge | undefined;
  readonly request: UserRequest;
  attempts: number;
  /** Called once, when the call succeeds or its last attempt fails. */
  readonly onSettled: (failure: Failure | undefined) => void;
}

interface Attempt {
  readonly call: Call;
  readonly number: number;
  /** Answered or timed out. A response after that is ignored. */
  settled: boolean;
}

/** One attempt's stay at its target. This is the token components hold. */
interface Visit {
  readonly attempt: Attempt;
  readonly arrivedMs: number;
  /** Index of the next nested call to make. */
  nextCall: number;
}

/** What the engine schedules on its own event queue. */
type EngineEvent =
  | UserArrivesEvent
  | AttemptArrivesEvent
  | ServiceDoneEvent
  | ResponseEvent
  | TimeoutEvent
  | RetryEvent
  | NothingToDeliverEvent;

interface UserArrivesEvent {
  readonly kind: "user-arrives";
}

interface AttemptArrivesEvent {
  readonly kind: "attempt-arrives";
  readonly attempt: Attempt;
}

interface ServiceDoneEvent {
  readonly kind: "service-done";
  readonly visit: Visit;
}

interface ResponseEvent {
  readonly kind: "response";
  readonly attempt: Attempt;
  readonly failure: Failure | undefined;
}

interface TimeoutEvent {
  readonly kind: "timeout";
  readonly attempt: Attempt;
}

interface RetryEvent {
  readonly kind: "retry";
  readonly call: Call;
}

interface NothingToDeliverEvent {
  readonly kind: "nothing-to-deliver";
  readonly visit: Visit;
}

/** The random stream for a name such as `"arrivals"`. */
type RandomStreams = (stream: string) => RandomSource;

interface CallInput {
  readonly step: Step;
  /** The calling component, or undefined for the user. */
  readonly fromId: string | undefined;
  readonly request: UserRequest;
  readonly onSettled: (failure: Failure | undefined) => void;
}

class Simulation {
  private readonly events = new EventQueue<EngineEvent>();
  private readonly components: ReadonlyMap<string, RuntimeComponent>;
  /** Keyed by `edgeKey(from, to)`. */
  private readonly edges: ReadonlyMap<string, Edge>;
  private readonly workflows: ReadonlyMap<string, Workflow>;
  private readonly arrivals: ArrivalProcess;
  private readonly retryRandom: RandomSource;
  private readonly observe: (event: SimulationEvent) => void;
  private readonly untilMs: number;
  private readonly tickMs: number | undefined;
  private nextTickMs: number;
  private nowMs = 0;
  private nextRequestId = 0;

  constructor(input: SimulationInput) {
    const { project } = input;
    const workload = findWorkload(input);
    const random = input.random ?? seededStreams(workload.seed);
    // Streams are created in this order; scripted sources in tests rely on it.
    this.components = buildComponents({ input, random });
    this.edges = indexEdges(project.architecture.edges);
    this.workflows = new Map(project.workflows.map((w) => [w.id, w]));
    this.arrivals = new ArrivalProcess({
      workload,
      timing: random("arrivals"),
      choice: random("workflows"),
    });
    this.retryRandom = random("retries");
    this.observe = input.observer ?? ignoreEvent;
    this.untilMs = input.untilMs ?? workload.durationSec * 1000;
    this.tickMs = checkTickMs(input.tickMs);
    this.nextTickMs = this.tickMs ?? Infinity;
  }

  run(): SimulationResult {
    this.scheduleNextUser();
    let processed = 0;
    let instantMs = 0;
    let atThisInstant = 0;
    for (
      let next = this.events.peek();
      next !== undefined && next.timeMs <= this.untilMs;
      next = this.events.peek()
    ) {
      this.events.pop();
      this.ticksBefore(next.timeMs);
      atThisInstant = next.timeMs === instantMs ? atThisInstant + 1 : 1;
      instantMs = next.timeMs;
      if (atThisInstant > MAX_EVENTS_AT_ONE_INSTANT) throwStuck(next.timeMs);
      this.nowMs = next.timeMs;
      handleKind(this.eventHandlers, next.payload);
      processed++;
    }
    this.finalTick();
    return { eventsProcessed: processed };
  }

  /** What each kind of engine event does when its time comes. */
  private readonly eventHandlers: KindHandlers<EngineEvent, void> = {
    "user-arrives": () => {
      this.startUserRequest();
      this.scheduleNextUser();
    },
    "attempt-arrives": ({ attempt }) => {
      this.arrive(attempt);
    },
    "service-done": ({ visit }) => {
      this.continueVisit(visit);
    },
    response: ({ attempt, failure }) => {
      this.respond(attempt, failure);
    },
    timeout: ({ attempt }) => {
      this.timeOut(attempt);
    },
    retry: ({ call }) => {
      this.sendAttempt(call);
    },
    "nothing-to-deliver": ({ visit }) => {
      this.dispatchFinished(visit, true);
    },
  };

  /**
   * What each effect a component returns turns into (ADR-0006). An effect's
   * request is always a visit at the component that returned it.
   */
  private readonly effectHandlers: KindHandlers<Effect<Visit>, void> = {
    started: ({ request: visit, serviceMs }) => {
      this.observe({ kind: "started", ...this.eventBase(visit), serviceMs });
      this.events.schedule(this.nowMs + serviceMs, {
        kind: "service-done",
        visit,
      });
    },
    queued: ({ request: visit }) => {
      this.observe({ kind: "queued", ...this.eventBase(visit) });
    },
    rejected: ({ request: visit, reason }) => {
      this.observe({ kind: "rejected", ...this.eventBase(visit), reason });
      const componentId = visit.attempt.call.target.id;
      this.respondLater(visit, { componentId, reason });
    },
    dispatched: ({ request: visit }) => {
      this.observe({ kind: "dispatched", ...this.eventBase(visit) });
      this.dispatch(visit);
    },
  };

  /** Reports every tick due before `timeMs` and before the end of the run. */
  private ticksBefore(timeMs: number): void {
    if (this.tickMs === undefined) return;
    while (this.nextTickMs <= timeMs && this.nextTickMs < this.untilMs) {
      this.nowMs = this.nextTickMs;
      this.tick();
      this.nextTickMs += this.tickMs;
    }
  }

  /** The ticks left before the end, then one at the end itself. */
  private finalTick(): void {
    this.ticksBefore(this.untilMs);
    if (this.tickMs === undefined || this.untilMs <= 0) return;
    this.nowMs = this.untilMs;
    this.tick();
  }

  private tick(): void {
    const components = [...this.components.values()].map(sampleAndResetPeaks);
    this.observe({ kind: "tick", timeMs: this.nowMs, components });
  }

  private scheduleNextUser(): void {
    const timeMs = this.arrivals.next(this.nowMs);
    if (timeMs === undefined) return;
    this.events.schedule(timeMs, { kind: "user-arrives" });
  }

  private startUserRequest(): void {
    const workflowId = this.arrivals.pickWorkflow();
    const workflow = this.workflows.get(workflowId);
    if (workflow === undefined) throw new Error(`No workflow "${workflowId}"`);
    const request: UserRequest = {
      id: this.nextRequestId++,
      workflowId,
      startMs: this.nowMs,
    };
    this.observe({
      kind: "workflow-started",
      timeMs: this.nowMs,
      requestId: request.id,
      workflowId,
    });
    this.call({
      step: workflow.root,
      fromId: undefined,
      request,
      onSettled: (failure) => {
        this.finishUserRequest(request, failure);
      },
    });
  }

  private finishUserRequest(
    request: UserRequest,
    failure: Failure | undefined,
  ): void {
    this.observe({
      kind: "workflow-finished",
      timeMs: this.nowMs,
      requestId: request.id,
      workflowId: request.workflowId,
      latencyMs: this.nowMs - request.startMs,
      ...(failure === undefined ? {} : { failure }),
    });
  }

  /** Calls `step` along the edge from `fromId`, as its retry policy allows. */
  private call({ step, fromId, request, onSettled }: CallInput): void {
    const target = this.components.get(step.componentId);
    if (target === undefined) {
      throw new Error(`No component "${step.componentId}"`);
    }
    const edge = this.edgeFor(fromId, step.componentId);
    this.sendAttempt({ step, target, edge, request, attempts: 0, onSettled });
  }

  /** The edge a call travels along; the user's call has none. */
  private edgeFor(fromId: string | undefined, toId: string): Edge | undefined {
    if (fromId === undefined) return undefined;
    const edge = this.edges.get(edgeKey(fromId, toId));
    if (edge === undefined) {
      throw new Error(`No edge from "${fromId}" to "${toId}"`);
    }
    return edge;
  }

  private sendAttempt(call: Call): void {
    call.attempts++;
    const attempt: Attempt = { call, number: call.attempts, settled: false };
    const { edge } = call;
    this.events.schedule(this.nowMs + (edge?.latencyMs ?? 0), {
      kind: "attempt-arrives",
      attempt,
    });
    if (edge === undefined) return;
    this.events.schedule(this.nowMs + edge.timeoutMs, {
      kind: "timeout",
      attempt,
    });
  }

  private arrive(attempt: Attempt): void {
    const { target, step, request } = attempt.call;
    const visit: Visit = { attempt, arrivedMs: this.nowMs, nextCall: 0 };
    this.observe({
      kind: "arrived",
      timeMs: this.nowMs,
      requestId: request.id,
      componentId: target.id,
      action: step.action,
    });
    const effects = target.behavior.arrive({
      request: visit,
      action: step.action,
      nowMs: this.nowMs,
    });
    this.apply(target, effects);
  }

  /**
   * Turns a component's effects into events. Called right after every call
   * into a component, so it also tracks peaks for the metrics.
   */
  private apply(component: RuntimeComponent, effects: Effect<Visit>[]): void {
    trackPeaks(component);
    for (const effect of effects) handleKind(this.effectHandlers, effect);
  }

  /** The fields every event about `visit` shares. */
  private eventBase(visit: Visit): ComponentEventBase {
    const { request, target } = visit.attempt.call;
    return {
      timeMs: this.nowMs,
      requestId: request.id,
      componentId: target.id,
    };
  }

  /** The visit's own service time is done, or a nested call succeeded: make the next call. */
  private continueVisit(visit: Visit): void {
    const { step, target, request } = visit.attempt.call;
    const child = step.calls?.[visit.nextCall];
    if (child === undefined) {
      this.completeVisit(visit, undefined);
      return;
    }
    visit.nextCall++;
    this.call({
      step: child,
      fromId: target.id,
      request,
      onSettled: (failure) => {
        this.childSettled(visit, failure);
      },
    });
  }

  /** A nested call is done: carry on with the next, or fail the visit. */
  private childSettled(visit: Visit, failure: Failure | undefined): void {
    if (failure !== undefined) {
      this.completeVisit(visit, failure);
      return;
    }
    this.continueVisit(visit);
  }

  /** Frees the visit's resources and sends its answer back to the caller. */
  private completeVisit(visit: Visit, failure: Failure | undefined): void {
    const { target } = visit.attempt.call;
    this.observe({
      kind: "finished",
      ...this.eventBase(visit),
      latencyMs: this.nowMs - visit.arrivedMs,
      ...(failure === undefined ? {} : { failure }),
    });
    this.respondLater(visit, failure);
    this.apply(
      target,
      target.behavior.finish({ request: visit, nowMs: this.nowMs }),
    );
  }

  /** Sends the answer back along the edge, which takes its latency again. */
  private respondLater(visit: Visit, failure: Failure | undefined): void {
    const { attempt } = visit;
    this.events.schedule(this.nowMs + (attempt.call.edge?.latencyMs ?? 0), {
      kind: "response",
      attempt,
      failure,
    });
  }

  private respond(attempt: Attempt, failure: Failure | undefined): void {
    // A caller that timed out has stopped waiting; the late answer is lost.
    if (attempt.settled) return;
    if (failure !== undefined) {
      this.failAttempt(attempt, failure);
      return;
    }
    attempt.settled = true;
    attempt.call.onSettled(undefined);
  }

  /** The caller stops waiting, unless the attempt was already answered. */
  private timeOut(attempt: Attempt): void {
    if (attempt.settled) return;
    const componentId = attempt.call.target.id;
    this.failAttempt(attempt, { componentId, reason: "timeout" });
  }

  /** Retries if the edge's policy allows; otherwise the call fails. */
  private failAttempt(attempt: Attempt, failure: Failure): void {
    attempt.settled = true;
    const { call } = attempt;
    const retryAtMs = this.retryAtMs(call);
    if (call.edge !== undefined) {
      this.observe({
        kind: "attempt-failed",
        timeMs: this.nowMs,
        requestId: call.request.id,
        edgeId: call.edge.id,
        attempt: attempt.number,
        failure,
        ...(retryAtMs === undefined ? {} : { retryAtMs }),
      });
    }
    if (retryAtMs === undefined) {
      call.onSettled(failure);
      return;
    }
    this.events.schedule(retryAtMs, { kind: "retry", call });
  }

  /** When to try `call` again, or undefined if it has no attempts left. */
  private retryAtMs(call: Call): number | undefined {
    const policy = call.edge?.retry;
    if (policy === undefined || call.attempts >= policy.maxAttempts) {
      return undefined;
    }
    const failedAttempts = call.attempts;
    const random = this.retryRandom;
    return this.nowMs + backoffMs({ policy, failedAttempts, random });
  }

  /** Starts the `async` step of a message a queue-like component delivers. */
  private dispatch(visit: Visit): void {
    const { step, target: queue, request } = visit.attempt.call;
    if (step.async === undefined) {
      // Nothing to run. Report success from a fresh event rather than
      // recursively, so a long backlog can't overflow the stack.
      this.events.schedule(this.nowMs, { kind: "nothing-to-deliver", visit });
      return;
    }
    this.call({
      step: step.async,
      fromId: queue.id,
      request,
      onSettled: (failure) => {
        this.dispatchFinished(visit, failure === undefined);
      },
    });
  }

  private dispatchFinished(visit: Visit, succeeded: boolean): void {
    const { target: queue, request } = visit.attempt.call;
    this.observe({
      kind: "async-finished",
      ...this.eventBase(visit),
      latencyMs: this.nowMs - request.startMs,
      succeeded,
    });
    this.apply(
      queue,
      queue.behavior.dispatchFinished?.({
        request: visit,
        succeeded,
        nowMs: this.nowMs,
      }) ?? [],
    );
  }
}

function findWorkload({ project, workloadId }: SimulationInput): Workload {
  const workload = project.workloads.find((w) => w.id === workloadId);
  if (workload === undefined) throw new Error(`No workload "${workloadId}"`);
  return workload;
}

/** Streams seeded from the workload's seed, one per name. */
function seededStreams(seed: number): RandomStreams {
  return (stream) => new SeededRandom(deriveSeed(seed, stream));
}

interface BuildComponentsInput {
  readonly input: SimulationInput;
  readonly random: RandomStreams;
}

/** Builds each component's behavior from its type in the registry. */
function buildComponents({
  input,
  random,
}: BuildComponentsInput): Map<string, RuntimeComponent> {
  const components = new Map<string, RuntimeComponent>();
  for (const component of input.project.architecture.components) {
    const type = input.registry.get(component.type);
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

function checkTickMs(tickMs: number | undefined): number | undefined {
  if (tickMs !== undefined && !(tickMs > 0)) {
    throw new Error(`tickMs must be positive, got ${String(tickMs)}`);
  }
  return tickMs;
}

function ignoreEvent(): void {
  // No observer: events are dropped.
}

function throwStuck(timeMs: number): never {
  throw new Error(
    `Simulation stuck: over ${String(MAX_EVENTS_AT_ONE_INSTANT)} events at t=${String(timeMs)} ms`,
  );
}

/** Raises the component's peaks to its current values. */
function trackPeaks(component: RuntimeComponent): void {
  const { behavior } = component;
  component.peakInProgress = Math.max(
    component.peakInProgress,
    behavior.inProgress,
  );
  component.peakQueueDepth = Math.max(
    component.peakQueueDepth,
    behavior.queueDepth,
  );
}

/** The component's state for a tick; its peaks start again from now. */
function sampleAndResetPeaks(component: RuntimeComponent): ComponentSample {
  const { behavior } = component;
  const sample: ComponentSample = {
    componentId: component.id,
    inProgress: behavior.inProgress,
    queueDepth: behavior.queueDepth,
    peakInProgress: component.peakInProgress,
    peakQueueDepth: component.peakQueueDepth,
    gauges: { ...behavior.gauges },
    counters: { ...behavior.counters },
  };
  component.peakInProgress = behavior.inProgress;
  component.peakQueueDepth = behavior.queueDepth;
  return sample;
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}
