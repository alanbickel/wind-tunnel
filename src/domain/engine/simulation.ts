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
} from "../model/project";
import {
  deriveSeed,
  SeededRandom,
  type RandomSource,
} from "../random/random-source";
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

class Simulation {
  private readonly events = new EventQueue<EngineEvent>();
  private readonly components = new Map<string, RuntimeComponent>();
  /** Keyed by `edgeKey(from, to)`. */
  private readonly edges = new Map<string, Edge>();
  private readonly workflows = new Map<string, Workflow>();
  private readonly arrivals: ArrivalProcess;
  private readonly retryRandom: RandomSource;
  private readonly observe: (event: SimulationEvent) => void;
  private readonly untilMs: number;
  private readonly tickMs: number | undefined;
  private nextTickMs = Infinity;
  private nowMs = 0;
  private nextRequestId = 0;

  constructor(input: SimulationInput) {
    const { project, registry } = input;
    const workload = project.workloads.find((w) => w.id === input.workloadId);
    if (workload === undefined) {
      throw new Error(`No workload "${input.workloadId}"`);
    }
    const random =
      input.random ??
      ((stream: string) => new SeededRandom(deriveSeed(workload.seed, stream)));

    for (const component of project.architecture.components) {
      const type = registry.get(component.type);
      if (type === undefined) {
        throw new Error(`Unknown component type "${component.type}"`);
      }
      this.components.set(component.id, {
        id: component.id,
        behavior: type.build<Visit>(component.config, {
          random: random(`component:${component.id}`),
        }),
        peakInProgress: 0,
        peakQueueDepth: 0,
      });
    }
    for (const edge of project.architecture.edges) {
      const key = edgeKey(edge.from, edge.to);
      if (!this.edges.has(key)) this.edges.set(key, edge);
    }
    for (const workflow of project.workflows) {
      this.workflows.set(workflow.id, workflow);
    }

    this.arrivals = new ArrivalProcess(
      workload,
      random("arrivals"),
      random("workflows"),
    );
    this.retryRandom = random("retries");
    this.observe = input.observer ?? (() => undefined);
    this.untilMs = input.untilMs ?? workload.durationSec * 1000;
    if (input.tickMs !== undefined && !(input.tickMs > 0)) {
      throw new Error(`tickMs must be positive, got ${String(input.tickMs)}`);
    }
    this.tickMs = input.tickMs;
    if (this.tickMs !== undefined) this.nextTickMs = this.tickMs;
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
      if (atThisInstant > MAX_EVENTS_AT_ONE_INSTANT) {
        throw new Error(
          `Simulation stuck: over ${String(MAX_EVENTS_AT_ONE_INSTANT)} events at t=${String(next.timeMs)} ms`,
        );
      }
      this.nowMs = next.timeMs;
      this.handle(next.payload);
      processed++;
    }
    this.ticksBefore(this.untilMs);
    if (this.tickMs !== undefined && this.untilMs > 0) {
      this.nowMs = this.untilMs;
      this.tick();
    }
    return { eventsProcessed: processed };
  }

  /** Reports every tick due before `timeMs` and before the end of the run. */
  private ticksBefore(timeMs: number): void {
    if (this.tickMs === undefined) return;
    while (this.nextTickMs <= timeMs && this.nextTickMs < this.untilMs) {
      this.nowMs = this.nextTickMs;
      this.tick();
      this.nextTickMs += this.tickMs;
    }
  }

  private tick(): void {
    const components: ComponentSample[] = [];
    for (const component of this.components.values()) {
      const { behavior } = component;
      components.push({
        componentId: component.id,
        inProgress: behavior.inProgress,
        queueDepth: behavior.queueDepth,
        peakInProgress: component.peakInProgress,
        peakQueueDepth: component.peakQueueDepth,
        gauges: { ...behavior.gauges },
        counters: { ...behavior.counters },
      });
      component.peakInProgress = behavior.inProgress;
      component.peakQueueDepth = behavior.queueDepth;
    }
    this.observe({ kind: "tick", timeMs: this.nowMs, components });
  }

  private handle(event: EngineEvent): void {
    switch (event.kind) {
      case "user-arrives":
        this.startUserRequest();
        this.scheduleNextUser();
        break;
      case "attempt-arrives":
        this.arrive(event.attempt);
        break;
      case "service-done":
        this.continueVisit(event.visit);
        break;
      case "response":
        this.respond(event.attempt, event.failure);
        break;
      case "timeout":
        if (!event.attempt.settled) {
          this.failAttempt(event.attempt, {
            componentId: event.attempt.call.target.id,
            reason: "timeout",
          });
        }
        break;
      case "retry":
        this.sendAttempt(event.call);
        break;
      case "nothing-to-deliver":
        this.dispatchFinished(event.visit, true);
        break;
    }
  }

  private scheduleNextUser(): void {
    const timeMs = this.arrivals.next(this.nowMs);
    if (timeMs !== undefined) {
      this.events.schedule(timeMs, { kind: "user-arrives" });
    }
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
    this.call(workflow.root, undefined, request, (failure) => {
      this.observe({
        kind: "workflow-finished",
        timeMs: this.nowMs,
        requestId: request.id,
        workflowId,
        latencyMs: this.nowMs - request.startMs,
        ...(failure === undefined ? {} : { failure }),
      });
    });
  }

  /** Calls `step` from component `fromId` (undefined for the user). */
  private call(
    step: Step,
    fromId: string | undefined,
    request: UserRequest,
    onSettled: (failure: Failure | undefined) => void,
  ): void {
    const target = this.components.get(step.componentId);
    if (target === undefined) {
      throw new Error(`No component "${step.componentId}"`);
    }
    let edge: Edge | undefined;
    if (fromId !== undefined) {
      edge = this.edges.get(edgeKey(fromId, step.componentId));
      if (edge === undefined) {
        throw new Error(`No edge from "${fromId}" to "${step.componentId}"`);
      }
    }
    this.sendAttempt({ step, target, edge, request, attempts: 0, onSettled });
  }

  private sendAttempt(call: Call): void {
    call.attempts++;
    const attempt: Attempt = { call, number: call.attempts, settled: false };
    const { edge } = call;
    this.events.schedule(this.nowMs + (edge?.latencyMs ?? 0), {
      kind: "attempt-arrives",
      attempt,
    });
    if (edge !== undefined) {
      this.events.schedule(this.nowMs + edge.timeoutMs, {
        kind: "timeout",
        attempt,
      });
    }
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
    this.apply(target, target.behavior.arrive(visit, step.action, this.nowMs));
  }

  /**
   * Turns a component's effects into events (ADR-0006). Called right after
   * every call into a component, so it also tracks peaks for the metrics.
   */
  private apply(component: RuntimeComponent, effects: Effect<Visit>[]): void {
    const { behavior } = component;
    if (behavior.inProgress > component.peakInProgress) {
      component.peakInProgress = behavior.inProgress;
    }
    if (behavior.queueDepth > component.peakQueueDepth) {
      component.peakQueueDepth = behavior.queueDepth;
    }
    for (const effect of effects) {
      const visit = effect.request;
      const base = {
        timeMs: this.nowMs,
        requestId: visit.attempt.call.request.id,
        componentId: component.id,
      };
      switch (effect.kind) {
        case "started":
          this.observe({
            kind: "started",
            ...base,
            serviceMs: effect.serviceMs,
          });
          this.events.schedule(this.nowMs + effect.serviceMs, {
            kind: "service-done",
            visit,
          });
          break;
        case "queued":
          this.observe({ kind: "queued", ...base });
          break;
        case "rejected":
          this.observe({ kind: "rejected", ...base, reason: effect.reason });
          this.respondLater(visit, {
            componentId: component.id,
            reason: effect.reason,
          });
          break;
        case "dispatched":
          this.observe({ kind: "dispatched", ...base });
          this.dispatch(component, visit);
          break;
      }
    }
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
    this.call(child, target.id, request, (failure) => {
      if (failure === undefined) this.continueVisit(visit);
      else this.completeVisit(visit, failure);
    });
  }

  /** Frees the visit's resources and sends its answer back to the caller. */
  private completeVisit(visit: Visit, failure: Failure | undefined): void {
    const { target, request } = visit.attempt.call;
    this.observe({
      kind: "finished",
      timeMs: this.nowMs,
      requestId: request.id,
      componentId: target.id,
      latencyMs: this.nowMs - visit.arrivedMs,
      ...(failure === undefined ? {} : { failure }),
    });
    this.respondLater(visit, failure);
    this.apply(target, target.behavior.finish(visit, this.nowMs));
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

  /** Retries if the edge's policy allows; otherwise the call fails. */
  private failAttempt(attempt: Attempt, failure: Failure): void {
    attempt.settled = true;
    const { call } = attempt;
    const policy = call.edge?.retry;
    const retryAtMs =
      policy !== undefined && call.attempts < policy.maxAttempts
        ? this.nowMs + backoffMs(policy, call.attempts, this.retryRandom)
        : undefined;
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
    if (retryAtMs === undefined) call.onSettled(failure);
    else this.events.schedule(retryAtMs, { kind: "retry", call });
  }

  /** Starts the `async` step of a message a queue-like component delivers. */
  private dispatch(queue: RuntimeComponent, visit: Visit): void {
    const { step, request } = visit.attempt.call;
    if (step.async === undefined) {
      // Nothing to run. Report success from a fresh event rather than
      // recursively, so a long backlog can't overflow the stack.
      this.events.schedule(this.nowMs, { kind: "nothing-to-deliver", visit });
      return;
    }
    this.call(step.async, queue.id, request, (failure) => {
      this.dispatchFinished(visit, failure === undefined);
    });
  }

  private dispatchFinished(visit: Visit, succeeded: boolean): void {
    const { target: queue, request } = visit.attempt.call;
    this.observe({
      kind: "async-finished",
      timeMs: this.nowMs,
      requestId: request.id,
      componentId: queue.id,
      latencyMs: this.nowMs - request.startMs,
      succeeded,
    });
    this.apply(
      queue,
      queue.behavior.dispatchFinished?.(visit, succeeded, this.nowMs) ?? [],
    );
  }
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}
