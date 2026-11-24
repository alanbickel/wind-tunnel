import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";

export interface RefuserBehaviorDependencies {
  /** The reason it rejects every request with. */
  readonly reason: string;
}

/**
 * Rejects every request with one reason, the same each time, so a test can
 * watch how the engine handles a failure of that reason's error kind. No
 * limits: the reason stands for one no limit explains, such as a failed
 * validation.
 */
export class RefuserBehavior<T> implements ComponentBehavior<T> {
  private readonly reason: string;

  constructor({ reason }: RefuserBehaviorDependencies) {
    this.reason = reason;
  }

  readonly inProgress = 0;
  readonly queueDepth = 0;

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    return [{ kind: "rejected", request, reason: this.reason }];
  }

  finish(): Effect<T>[] {
    return [];
  }
}
