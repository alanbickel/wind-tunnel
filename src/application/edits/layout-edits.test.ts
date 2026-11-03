import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { moveComponent } from "./layout-edits";

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

/** The sample, with the layout not placing `fn`. */
function withFnUnplaced(): ProjectRecord {
  const nodes = Object.fromEntries(
    Object.entries(sampleRecord.layout.nodes).filter(([id]) => id !== "fn"),
  );
  return { ...sampleRecord, layout: { nodes } };
}

describe("moveComponent", () => {
  // Fails if the move changes another point, drops one, touches the
  // project, or changes the record it was given.
  it("sets the component's point and leaves the rest as it was", () => {
    const before = copyOf(sampleRecord);

    const moved = moveComponent(sampleRecord, {
      componentId: "fn",
      position: { x: 260, y: 120 },
    });

    expect(moved.layout.nodes).toEqual({
      api: { x: 0, y: 0 },
      fn: { x: 260, y: 120 },
      table: { x: 500, y: 0 },
    });
    expect(moved.project).toBe(sampleRecord.project);
    expect({ ...moved, layout: sampleRecord.layout }).toEqual(sampleRecord);
    expect(sampleRecord).toEqual(before);
  });

  // Fails if a component the layout doesn't place can't be moved: it
  // would stay in the diagram's spare row.
  it("places a component the layout doesn't", () => {
    const moved = moveComponent(withFnUnplaced(), {
      componentId: "fn",
      position: { x: 40, y: 300 },
    });

    expect(moved.layout.nodes.fn).toEqual({ x: 40, y: 300 });
  });

  // Fails if a move to where the component already is returns a new
  // record: `edit` would save it, and undo would count a step that did
  // nothing.
  it("returns the same record when the component is already there", () => {
    const moved = moveComponent(sampleRecord, {
      componentId: "fn",
      position: { x: 250, y: 0 },
    });

    expect(moved).toBe(sampleRecord);
  });

  // Fails if a move for a component the project doesn't have places it,
  // leaving a point that the diagram never draws.
  it("returns the same record for a component the project doesn't have", () => {
    const moved = moveComponent(sampleRecord, {
      componentId: "gone",
      position: { x: 1, y: 1 },
    });

    expect(moved).toBe(sampleRecord);
  });
});
