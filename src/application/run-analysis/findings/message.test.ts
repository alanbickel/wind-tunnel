import { describe, expect, it } from "vitest";
import { component, count, listOf, plural, say } from "./message";

describe("say", () => {
  // Fails if the text between parts is dropped, a nested message isn't
  // flattened, or neighboring text stays in separate parts.
  it("turns a template into parts, merging the text", () => {
    expect(
      say`${component("fn")} held ${count(3)} of ${say`its ${"slots"}`}.`,
    ).toEqual([
      { kind: "component", componentId: "fn" },
      { kind: "text", text: " held " },
      { kind: "number", value: 3, unit: "count" },
      { kind: "text", text: " of its slots." },
    ]);
  });
});

describe("listOf", () => {
  // Fails if the list loses its "and" or its serial comma.
  it.each([
    [["A"], "A"],
    [["A", "B"], "A and B"],
    [["A", "B", "C"], "A, B, and C"],
  ])("lists %j as %s", (items, text) => {
    expect(listOf(items.map((i) => say`${i}`))).toEqual([
      { kind: "text", text },
    ]);
  });
});

describe("plural", () => {
  // Fails if 1 takes the plural form, or 0 the singular.
  it.each([
    [0, "requests"],
    [1, "request"],
    [2, "requests"],
  ])("uses the right form for %i", (n, form) => {
    expect(plural(n, ["request", "requests"])).toBe(form);
  });
});
