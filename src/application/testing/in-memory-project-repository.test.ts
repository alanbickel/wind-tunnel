import { describe, expect, it } from "vitest";
import { checkProjectRepositoryContract } from "./check-project-repository-contract";
import { InMemoryProjectRepository } from "./in-memory-project-repository";
import { sampleRecord } from "./sample-record";

describe("InMemoryProjectRepository", () => {
  it("passes the repository contract", async () => {
    expect(
      await checkProjectRepositoryContract(
        new InMemoryProjectRepository(),
        sampleRecord,
      ),
    ).toEqual([]);
  });
});
