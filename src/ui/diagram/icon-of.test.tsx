import { describe, expect, it } from "vitest";
import { iconOf, type Icon } from "./icon-of";

const Drawn: Icon = () => null;

describe("iconOf", () => {
  // Fails if iconOf unwraps a plain component into undefined.
  it("returns an icon imported as the component", () => {
    expect(iconOf(Drawn)).toBe(Drawn);
  });

  // Fails if the module object the production build gives for a default
  // import of react-aws-icons is used as the component: React rejects it
  // (error 130) and the diagram falls back to "Couldn't load the diagram".
  it("unwraps an icon imported as a module object", () => {
    expect(iconOf({ default: Drawn })).toBe(Drawn);
  });
});
