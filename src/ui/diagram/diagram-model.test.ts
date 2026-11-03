import { describe, expect, it } from "vitest";
import { canConnect, type DiagramEdge } from "./diagram-model";

const edges: DiagramEdge[] = [{ id: "a-b", source: "a", target: "b" }];

describe("canConnect", () => {
  // Fails if the canvas lets a drag draw an arrow from a box to itself, or
  // a second arrow the same way: the save would refuse either.
  it("refuses a loop and a second arrow the same way", () => {
    expect(canConnect(edges, { source: "a", target: "a" })).toBe(false);
    expect(canConnect(edges, { source: "a", target: "b" })).toBe(false);
  });

  // Fails if canConnect refuses an arrow back the other way, which is an
  // edge of its own.
  it("allows a new pair, or the same pair the other way", () => {
    expect(canConnect(edges, { source: "b", target: "a" })).toBe(true);
    expect(canConnect(edges, { source: "a", target: "c" })).toBe(true);
  });
});
