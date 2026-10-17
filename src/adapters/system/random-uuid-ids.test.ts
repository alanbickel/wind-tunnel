import { describe, expect, it } from "vitest";
import { RandomUuidIds } from "./random-uuid-ids";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("RandomUuidIds", () => {
  it("returns version 4 UUIDs", () => {
    expect(new RandomUuidIds().newId()).toMatch(UUID_V4);
  });

  it("returns a different ID each call", () => {
    const ids = new RandomUuidIds();

    expect(ids.newId()).not.toBe(ids.newId());
  });
});
