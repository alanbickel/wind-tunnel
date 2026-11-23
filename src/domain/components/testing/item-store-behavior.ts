import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";

/** A read's request settings, as the item store's schema parses them. */
export interface ItemStoreReadSettings {
  /** The item's size. */
  readonly itemSizeKb: number;
  /** How long each KB takes to read. */
  readonly msPerKb: number;
  /** A choice setting, for tests of choice fields; it doesn't change the read's time. */
  readonly consistency: "eventual" | "strong";
}

export interface ItemStoreBehaviorDependencies {
  /** How long every write takes; writes take no request settings. */
  readonly writeMs: number;
}

/**
 * Starts every request at once. A read takes as long as its request
 * settings say (`itemSizeKb` × `msPerKb`), so a test can see in the service
 * time which settings reached `arrive`; a write takes `writeMs`. No limits.
 */
export class ItemStoreBehavior<T> implements ComponentBehavior<T> {
  private readonly writeMs: number;
  private started = 0;

  constructor({ writeMs }: ItemStoreBehaviorDependencies) {
    this.writeMs = writeMs;
  }

  get inProgress(): number {
    return this.started;
  }

  readonly queueDepth = 0;

  arrive({ request, action, settings }: ArriveInput<T>): Effect<T>[] {
    this.started++;
    // The registry parsed `settings` with the read schema, so the cast holds.
    const read = settings as unknown as ItemStoreReadSettings;
    const serviceMs =
      action === "read" ? read.itemSizeKb * read.msPerKb : this.writeMs;
    return [{ kind: "started", request, serviceMs }];
  }

  finish(): Effect<T>[] {
    this.started--;
    return [];
  }
}
