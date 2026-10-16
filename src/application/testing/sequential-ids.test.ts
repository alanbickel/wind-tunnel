import { describe, expect, it } from "vitest";
import { SequentialIds } from "./sequential-ids";

describe("SequentialIds", () => {
  it("counts up from 1 with its prefix", () => {
    const ids = new SequentialIds("project");
    expect([ids.newId(), ids.newId()]).toEqual(["project-1", "project-2"]);
  });
});
