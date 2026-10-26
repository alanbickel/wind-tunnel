import { describe, expect, it } from "vitest";
import { sameContent } from "./same-content";

describe("sameContent", () => {
  // Fails if it compares references, or key order: a setting rebuilt from
  // a component's defaults could list its keys in another order.
  it.each<[string, unknown, unknown]>([
    ["equal numbers", 1, 1],
    [
      "rebuilt objects",
      { a: 1, b: [1, { c: "x" }] },
      { a: 1, b: [1, { c: "x" }] },
    ],
    ["keys in another order", { a: 1, b: 2 }, { b: 2, a: 1 }],
    [
      "a key set to undefined and one left out",
      { a: 1, b: undefined },
      { a: 1 },
    ],
  ])("is true for %s", (_, a, b) => {
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(b, a)).toBe(true);
  });

  // Fails if a nested difference, a missing key, an extra array entry, or
  // an array standing in for an object goes unnoticed.
  it.each<[string, unknown, unknown]>([
    ["different numbers", 1, 2],
    ["a nested difference", { a: { b: [1, 2] } }, { a: { b: [1, 3] } }],
    ["a key in place of another", { a: 1 }, { b: 1 }],
    ["an extra key", { a: 1 }, { a: 1, b: 2 }],
    ["an extra array entry", [1], [1, undefined]],
    ["an array and an object with its keys", ["x"], { 0: "x" }],
    ["null and an object", null, {}],
  ])("is false for %s", (_, a, b) => {
    expect(sameContent(a, b)).toBe(false);
    expect(sameContent(b, a)).toBe(false);
  });
});
