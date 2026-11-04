import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import { renameComponent } from "./component-edits";
import {
  NO_EDITS,
  recordEdit,
  redoEdit,
  undoEdit,
  type EditHistory,
  type HistoryMove,
} from "./edit-history";

/** The record with the table named `name`. */
function tableNamed(record: ProjectRecord, name: string): ProjectRecord {
  return renameComponent(record, { componentId: "table", name });
}

const first = tableNamed(sampleRecord, "Orders");
const second = tableNamed(first, "Payments");

/** Two renames of the table: Table to Orders, then Orders to Payments. */
const twoRenames: EditHistory = recordEdit(
  recordEdit(NO_EDITS, {
    description: "Rename Table to Orders",
    before: sampleRecord,
    after: first,
  }),
  { description: "Rename Orders to Payments", before: first, after: second },
);

function moved(move: HistoryMove | undefined): HistoryMove {
  if (move === undefined) throw new Error("nothing to move to");
  return move;
}

describe("the edit history", () => {
  // Fails if an undo goes to the step's after, not its before, or a redo
  // to its before: each would give back the wrong record.
  it("undoes then redoes back to the same records", () => {
    const undone = moved(undoEdit(twoRenames));
    expect(undone.to).toBe(first);
    expect(undone.step.description).toBe("Rename Orders to Payments");

    const undoneTwice = moved(undoEdit(undone.history));
    expect(undoneTwice.to).toBe(sampleRecord);

    const redone = moved(redoEdit(undoneTwice.history));
    expect(redone.to).toBe(first);
    const redoneTwice = moved(redoEdit(redone.history));
    expect(redoneTwice.to).toBe(second);
    expect(redoneTwice.history).toEqual(twoRenames);
  });

  // Fails if a new edit after an undo keeps the redo, which would then
  // bring back a record that doesn't follow from the new one.
  it("drops what could be redone when a new edit follows an undo", () => {
    const undone = moved(undoEdit(twoRenames));
    const other = tableNamed(first, "Invoices");

    const edited = recordEdit(undone.history, {
      description: "Rename Orders to Invoices",
      before: first,
      after: other,
    });

    expect(redoEdit(edited)).toBeUndefined();
    expect(moved(undoEdit(edited)).to).toBe(first);
  });

  // Fails if an undo or a redo with nothing to do returns a move, which
  // would save and announce a change that didn't happen.
  it("changes nothing with nothing to undo or redo", () => {
    expect(undoEdit(NO_EDITS)).toBeUndefined();
    expect(redoEdit(NO_EDITS)).toBeUndefined();
    expect(redoEdit(twoRenames)).toBeUndefined();
  });
});
