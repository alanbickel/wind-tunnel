import { describe, expect, it } from "vitest";
import { SequentialIds } from "../testing/sequential-ids";
import { NewWorkload } from "./new-workload";

describe("NewWorkload", () => {
  // Fails if two calls give the same id, or the id doesn't come from the
  // IdGenerator port.
  it("gives a new id each time", () => {
    const newWorkload = new NewWorkload({ ids: new SequentialIds("wl") });

    expect(newWorkload.execute()).toEqual({ workloadId: "wl-1" });
    expect(newWorkload.execute()).toEqual({ workloadId: "wl-2" });
  });
});
