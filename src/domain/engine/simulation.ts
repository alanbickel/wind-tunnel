import type { Effect } from "../components/component-behavior";
import type { Step } from "../model/project";
import type { RandomSource } from "../random/random-source";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type { ArrivalProcess } from "./arrival-process";
import { backoffMs } from "./backoff";
import type { EventQueue } from "./event-queue";
import type {
  Attempt,
  Call,
  RuntimeComponent,
  UserRequest,
  Visit,
} from "./runtime-records";
import type { ScheduledWork } from "./scheduled-work";
import {
  TIMEOUT_REASON,
  type ComponentEventBase,
  type Failure,
  type SimulationEvent,
  type SimulationResult,
} from "./simulation-events";
import type { TickSampler } from "./tick-sampler";
import type { Topology } from "./topology";

/**
 * More events than this at one simulated instant means the run is stuck in a
 * loop that never advances time, e.g. a queue redelivering instantly to a
 * consumer that rejects instantly over a zero-latency edge.
 */
export const MAX_EVENTS_AT_ONE_INSTANT = 1_000_000;

interface CallInput {
  readonly step: Step;
  /** The calling component, or undefined for the user. */
  readonly fromId: string | undefined;
  readonly request: UserRequest;
  readonly onSettled: (failure: Failure | undefined) => void;
}

export interface SimulationDependencies {
  readonly events: EventQueue<ScheduledWork>;
  readonly topology: Topology;
  readonly arrivals: ArrivalProcess;
  readonly ticks: TickSampler;
  /** Draws the jitter in retry backoff. */
  readonly retryRandom: RandomSource;
  readonly observe: (event: SimulationEvent) => void;
  /** The simulated time the run stops at. */
  readonly untilMs: number;
}

/**
 * One run's discrete-event loop (MVP design §4): pops events in time order
 * and carries each call through its attempts and visits. `createSimulation`
 * builds it.
 */
export class Simulation {
  private readonly events: EventQueue<ScheduledWork>;
  private readonly topology: Topology;
  private readonly arrivals: ArrivalProcess;
  private readonly retryRandom: RandomSource;
  private readonly observe: (event: SimulationEvent) => void;
  private readonly untilMs: number;
  private readonly ticks: TickSampler;
  private nowMs = 0;
  private nextRequestId = 0;

  constructor(dependencies: SimulationDependencies) {
    this.events = dependencies.events;
    this.topology = dependencies.topology;
    this.arrivals = dependencies.arrivals;
    this.retryRandom = dependencies.retryRandom;
    this.observe = dependencies.observe;
    this.untilMs = dependencies.untilMs;
    this.ticks = dependencies.ticks;
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
      this.ticks.ticksBefore(next.timeMs);
      atThisInstant = next.timeMs === instantMs ? atThisInstant + 1 : 1;
      instantMs = next.timeMs;
      if (atThisInstant > MAX_EVENTS_AT_ONE_INSTANT) throwStuck(next.timeMs);
      this.nowMs = next.timeMs;
      handleKind(this.eventHandlers, next.payload);
      processed++;
    }
    this.ticks.finalTick();
    return { eventsProcessed: processed };
  }

  /** What each kind of scheduled work does when its time comes. */
  private readonly eventHandlers: KindHandlers<ScheduledWork, void> = {
    "user-due": () => {
      this.startUserRequest();
      this.scheduleNextUser();
    },
    "attempt-reaches-target": ({ attempt }) => {
      this.arrive(attempt);
    },
    "visit-service-done": ({ visit }) => {
      this.continueVisit(visit);
    },
    "attempt-answered": ({ attempt, failure }) => {
      this.respond(attempt, failure);
    },
    "attempt-timed-out": ({ attempt }) => {
      this.timeOut(attempt);
    },
    "call-retry-due": ({ call }) => {
      this.sendAttempt(call);
    },
    "visit-nothing-to-deliver": ({ visit }) => {
      this.dispatchFinished(visit, true);
    },
  };

  /**
   * What each effect a component returns turns into (ADR-0006). An effect's
   * request is always a visit at the component that returned it.
   */
  private readonly effectHandlers: KindHandlers<Effect<Visit>, void> = {
    started: ({ request: visit, serviceMs }) => {
      this.observe({
        kind: "component-started",
        ...this.eventBase(visit),
        serviceMs,
      });
      this.events.schedule(this.nowMs + serviceMs, {
        kind: "visit-service-done",
        visit,
      });
    },
    queued: ({ request: visit }) => {
      this.observe({ kind: "component-queued", ...this.eventBase(visit) });
    },
    rejected: ({ request: visit, reason }) => {
      this.observe({
        kind: "component-rejected",
        ...this.eventBase(visit),
        reason,
      });
      const componentId = visit.attempt.call.target.id;
      this.respondLater(visit, { componentId, reason });
    },
    dispatched: ({ request: visit }) => {
      this.observe({ kind: "component-dispatched", ...this.eventBase(visit) });
      this.dispatch(visit);
    },
  };

  private scheduleNextUser(): void {
    const timeMs = this.arrivals.next(this.nowMs);
    if (timeMs === undefined) return;
    this.events.schedule(timeMs, { kind: "user-due" });
  }

  private startUserRequest(): void {
    const workflowId = this.arrivals.pickWorkflow();
    const workflow = this.topology.workflow(workflowId);
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
    const target = this.topology.component(step.componentId);
    const edge = this.topology.edgeFor(fromId, step.componentId);
    this.sendAttempt({ step, target, edge, request, attempts: 0, onSettled });
  }

  private sendAttempt(call: Call): void {
    call.attempts++;
    const attempt: Attempt = { call, number: call.attempts, settled: false };
    const { edge } = call;
    this.events.schedule(this.nowMs + (edge?.latencyMs ?? 0), {
      kind: "attempt-reaches-target",
      attempt,
    });
    if (edge === undefined) return;
    this.events.schedule(this.nowMs + edge.timeoutMs, {
      kind: "attempt-timed-out",
      attempt,
    });
  }

  private arrive(attempt: Attempt): void {
    const { target, step, request } = attempt.call;
    const visit: Visit = { attempt, arrivedMs: this.nowMs, nextCall: 0 };
    this.observe({
      kind: "component-arrived",
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
    this.ticks.trackPeaks(component, this.nowMs);
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
      kind: "component-finished",
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
      kind: "attempt-answered",
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
    this.failAttempt(attempt, { componentId, reason: TIMEOUT_REASON });
  }

  /** Retries if the edge's policy allows; otherwise the call fails. */
  private failAttempt(attempt: Attempt, failure: Failure): void {
    attempt.settled = true;
    const { call } = attempt;
    const retryAtMs = this.retryAtMs(call);
    if (call.edge !== undefined) {
      this.observe({
        kind: "edge-attempt-failed",
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
    this.events.schedule(retryAtMs, { kind: "call-retry-due", call });
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
      this.events.schedule(this.nowMs, {
        kind: "visit-nothing-to-deliver",
        visit,
      });
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
      kind: "component-async-finished",
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

function throwStuck(timeMs: number): never {
  throw new Error(
    `Simulation stuck: over ${String(MAX_EVENTS_AT_ONE_INSTANT)} events at t=${String(timeMs)} ms`,
  );
}
