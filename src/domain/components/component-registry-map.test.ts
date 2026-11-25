import { describe, expect, it } from "vitest";
import { SeededRandom } from "../random/seeded-random";
import { ComponentRegistryMap } from "./component-registry-map";
import {
  itemStoreDefinition,
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";

const registry = () =>
  new ComponentRegistryMap()
    .register(workerPoolDefinition)
    .register(messageQueueDefinition);

describe("ComponentRegistryMap", () => {
  // Fails if register stops copying the definition's rejectionReasons.
  it("looks up registered types and lists them in order", () => {
    const r = registry();
    expect(r.get("test-worker-pool")?.displayName).toBe("Test worker pool");
    expect(r.get("test-worker-pool")?.rejectionReasons).toEqual({
      "queue-full": "throttling",
    });
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
    expect(
      behavior?.arrive({
        request: "a",
        action: "invoke",
        settings: {},
        nowMs: 0,
      }),
    ).toEqual([{ kind: "started", request: "a", serviceMs: 5 }]);
    expect(
      behavior?.arrive({
        request: "b",
        action: "invoke",
        settings: {},
        nowMs: 0,
      }),
    ).toEqual([{ kind: "queued", request: "b" }]);
  });

  it("throws when asked to build from an invalid config", () => {
    const type = registry().get("test-worker-pool");
    expect(() =>
      type?.build({ workers: 0 }, { random: new SeededRandom(1) }),
    ).toThrow();
  });

  describe("request settings", () => {
    const store = () =>
      new ComponentRegistryMap()
        .register(itemStoreDefinition)
        .get("test-item-store");

    // Fails if parseSettings stops parsing with the action's schema, so the defaults aren't filled in.
    it("fills in the defaults a step doesn't set", () => {
      expect(store()?.parseSettings("read", { itemSizeKb: 40 })).toEqual({
        itemSizeKb: 40,
        msPerKb: 1,
        consistency: "eventual",
      });
      expect(store()?.parseSettings("read", undefined)).toEqual({
        itemSizeKb: 4,
        msPerKb: 1,
        consistency: "eventual",
      });
    });

    // Fails if an action with no schema accepts any settings, or parses to anything but {}.
    it("gives an action that takes none {}, and takes no keys for it", () => {
      expect(store()?.parseSettings("write", undefined)).toEqual({});
      expect(store()?.checkSettings("write", {})).toEqual([]);
      expect(store()?.checkSettings("write", { itemSizeKb: 4 })).toEqual([
        { path: [], message: expect.stringContaining("itemSizeKb") as string },
      ]);
      expect(() =>
        store()?.parseSettings("write", { itemSizeKb: 4 }),
      ).toThrow();
    });

    // Fails if checkSettings stops reporting each problem with its path into the settings.
    it("checks settings with the action's schema, with paths relative to them", () => {
      expect(store()?.checkSettings("read", undefined)).toEqual([]);
      const issues = store()?.checkSettings("read", {
        itemSizeKb: 0,
        colour: "red",
      });
      expect(issues?.map((i) => i.path)).toEqual([["itemSizeKb"], []]);
    });
  });
});
