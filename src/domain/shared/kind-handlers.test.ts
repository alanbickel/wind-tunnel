import { describe, expect, it } from "vitest";
import { handleKind, type KindHandlers } from "./kind-handlers";

interface Circle {
  readonly kind: "circle";
  readonly radius: number;
}

interface Square {
  readonly kind: "square";
  readonly side: number;
}

type Shape = Circle | Square;

const AREA: KindHandlers<Shape, number> = {
  circle: ({ radius }) => Math.PI * radius ** 2,
  square: ({ side }) => side ** 2,
};

describe("handleKind", () => {
  it("calls the handler for the member's kind", () => {
    expect(handleKind(AREA, { kind: "square", side: 3 })).toBe(9);
    expect(handleKind(AREA, { kind: "circle", radius: 1 })).toBeCloseTo(
      Math.PI,
    );
  });

  it("throws for a kind with no handler, such as one from unchecked data", () => {
    const unknown = JSON.parse('{"kind":"triangle"}') as Shape;
    expect(() => handleKind(AREA, unknown)).toThrow(
      'No handler for kind "triangle"',
    );
  });

  it("doesn't treat inherited properties as handlers", () => {
    const inherited = JSON.parse('{"kind":"toString"}') as Shape;
    expect(() => handleKind(AREA, inherited)).toThrow(
      'No handler for kind "toString"',
    );
  });

  it("requires a handler for every kind", () => {
    // @ts-expect-error: "square" has no handler.
    const missing: KindHandlers<Shape, number> = { circle: () => 0 };
    expect(missing).toBeDefined();
  });
});
