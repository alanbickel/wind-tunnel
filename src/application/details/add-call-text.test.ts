import { describe, expect, it } from "vitest";
import { addCallText, noEdgesNote } from "./add-call-text";

describe("addCallText", () => {
  // Fails if the words say anything of an edge (a call never adds one), or
  // name its components other than by name, caller first.
  it("names the call for Undo and the announcement", () => {
    expect(addCallText({ callerName: "api", calleeName: "fn" })).toEqual({
      undoName: "Add a call from api to fn",
      announcement: "Added a call from api to fn.",
    });
  });
});

describe("noEdgesNote", () => {
  // Fails if the note leaves out the caller's name, or either way to
  // connect it: the handle on its box, or "Connect to…" in its Details.
  it("names the caller and both ways to connect it", () => {
    const note = noEdgesNote("api");

    expect(note).toContain("api has no edges");
    expect(note).toContain("handle");
    expect(note).toContain("Connect to…");
  });
});
