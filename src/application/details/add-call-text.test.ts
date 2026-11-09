import { describe, expect, it } from "vitest";
import { addCallText } from "./add-call-text";

describe("addCallText", () => {
  // Fails if a call along an edge that's there says anything of an edge, or
  // names its components other than by name, caller first.
  it("names the call for Undo and the announcement", () => {
    expect(
      addCallText({ callerName: "api", calleeName: "fn", addsEdge: false }),
    ).toEqual({
      undoName: "Add a call from api to fn",
      announcement: "Added a call from api to fn.",
    });
  });

  // Fails if Undo's name leaves out the edge, or the announcement doesn't
  // say the edge appeared (it appears away from the focus, so a screen
  // reader user would otherwise never hear of it).
  it("names the edge too when the call adds one", () => {
    expect(
      addCallText({ callerName: "api", calleeName: "fn", addsEdge: true }),
    ).toEqual({
      undoName: "Add a call from api to fn, and its edge",
      announcement:
        "Added a call from api to fn. Added the edge from api to fn.",
    });
  });
});
