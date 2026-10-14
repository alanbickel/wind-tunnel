import { describe, expect, it } from "vitest";
import { SeededRandom } from "../random/random-source";
import { ComponentRegistry } from "./component-registry";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";

const registry = () =>
  new ComponentRegistry()
    .register(workerPoolDefinition)
    .register(messageQueueDefinition);

describe("ComponentRegistry", () => {
  it("looks up registered types and lists them in order", () => {
    const r = registry();
    expect(r.get("test-worker-pool")?.displayName).toBe("Test worker pool");
    expect(r.get("nope")).toBeUndefined();
    expect(r.list().map((t) => t.type)).toEqual([
      "test-worker-pool",
      "test-message-queue",
    ]);
  });

  it("refuses to register a type twice", () => {
    expect(() => registry().register(workerPoolDefinition)).toThrow(
      /already registered/,
    );
  });

  it("checks configs with the definition's schema, with paths", () => {
    const type = registry().get("test-worker-pool");
    expect(type?.checkConfig(workerPoolDefinition.defaultConfig)).toEqual([]);
    const issues = type?.checkConfig({ workers: 0, serviceTime: {} });
    expect(issues?.map((i) => i.path)).toEqual([
      ["workers"],
      ["serviceTime", "kind"],
    ]);
  });

  it("builds a working behavior from an untyped config", () => {
    const type = registry().get("test-worker-pool");
    const behavior = type?.build<string>(
      { workers: 1, serviceTime: { kind: "constant", valueMs: 5 } },
      { random: new SeededRandom(1) },
    );
    expect(behavior?.arrive("a", "invoke", 0)).toEqual([
      { kind: "started", request: "a", serviceMs: 5 },
    ]);
    expect(behavior?.arrive("b", "invoke", 0)).toEqual([
      { kind: "queued", request: "b" },
    ]);
  });

  it("throws when asked to build from an invalid config", () => {
    const type = registry().get("test-worker-pool");
    expect(() =>
      type?.build({ workers: 0 }, { random: new SeededRandom(1) }),
    ).toThrow();
  });
});
